/** @vitest-environment jsdom */
/** @file Tests required versus optional catalog endpoints and health request cancellation. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProductHealth, loadCatalog } from "./aggregatorApi";

const response = (payload: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 503,
  json: async () => payload,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("aggregatorApi", () => {
  it("loads required catalog data when optional requests fail independently", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async (input: URL) => {
      const path = input.pathname;
      if (path.endsWith("/items")) {
        return response({ items: [{ id: "checkout", title: "Checkout" }] });
      }
      if (path.endsWith("/dependencies")) {
        return response({ dependencies: [] });
      }
      if (path.endsWith("/contacts")) {
        throw new TypeError("Network unavailable");
      }
      if (path.endsWith("/item-contacts")) {
        return {
          ok: true,
          json: async () => {
            throw new SyntaxError("Bad JSON");
          },
        };
      }
      if (path.endsWith("/actors")) {
        return response({}, false);
      }
      if (path.endsWith("/item-actors")) {
        return response(null);
      }
      return response({ actorContacts: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await loadCatalog();
    expect(catalog.items).toEqual([
      {
        id: "checkout",
        title: "Checkout",
        shortDescription: undefined,
        fullDescription: undefined,
      },
    ]);
    expect(catalog.dependencies).toEqual([]);
    expect(catalog.contacts).toEqual([]);
    expect(catalog.itemContacts).toEqual([]);
    expect(catalog.actors).toEqual([]);
    expect(catalog.itemActors).toEqual([]);
    expect(catalog.actorContacts).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("still rejects when a required catalog endpoint fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL) =>
        input.pathname.endsWith("/items")
          ? response({}, false)
          : response({ dependencies: [] }),
      ),
    );
    await expect(loadCatalog()).rejects.toThrow(
      "Failed to load catalog data: 503",
    );
  });

  it("passes cancellation to the Product Health request", async () => {
    const fetchMock = vi.fn(async () => response([]));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const health = await fetchProductHealth(controller.signal);
    expect(health.items).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), {
      signal: controller.signal,
    });
  });
});
