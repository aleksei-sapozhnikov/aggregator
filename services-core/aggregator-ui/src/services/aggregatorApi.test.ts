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
  vi.useRealTimers();
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

  it("times out a stalled optional request while keeping the required catalog", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let optionalAborted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: URL, init?: RequestInit) => {
        if (input.pathname.endsWith("/contacts")) {
          return new Promise((_, reject) => {
            init?.signal?.addEventListener("abort", () => {
              optionalAborted = true;
              reject(new DOMException("Aborted", "AbortError"));
            });
          });
        }
        return Promise.resolve(
          input.pathname.endsWith("/items")
            ? response({ items: [{ id: "checkout", title: "Checkout" }] })
            : response({ dependencies: [] }),
        );
      }),
    );

    const pending = loadCatalog();
    await vi.advanceTimersByTimeAsync(3_000);
    const catalog = await pending;
    expect(optionalAborted).toBe(true);
    expect(catalog.items).toHaveLength(1);
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

  it("rejects malformed Product Health data instead of reporting UNKNOWN", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response({ error: "unavailable" })),
    );
    await expect(fetchProductHealth()).rejects.toThrow(
      "Invalid Product Health response",
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
