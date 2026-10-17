/** @vitest-environment jsdom */
/** @file Tests catalog loading and periodic Product Health refresh behavior. */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProductHealth, loadCatalog } from "../../services/aggregatorApi";
import useCatalogData from "./useCatalogData";

vi.mock("../../services/aggregatorApi", () => ({
  loadCatalog: vi.fn(),
  fetchProductHealth: vi.fn(),
}));

const catalog: Awaited<ReturnType<typeof loadCatalog>> = {
  items: [{ id: "checkout", title: "Checkout" }],
  dependencies: [],
  contacts: [{ id: "email", type: "email", title: "Team email" }],
  itemContacts: [],
  actors: [],
  itemActors: [],
  actorContacts: [],
};

const health: Awaited<ReturnType<typeof fetchProductHealth>> = {
  items: [
    {
      itemId: "checkout",
      title: "Checkout",
      state: "down",
      ownState: "up",
      signals: [{ id: "availability", status: "up" }],
      dependencies: [],
      affectingDependencies: [],
    },
  ],
  itemStatuses: { checkout: "down" },
  itemSignals: { checkout: [{ id: "availability", status: "up" }] },
};

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.mocked(loadCatalog).mockReset();
  vi.mocked(fetchProductHealth).mockReset();
  vi.mocked(loadCatalog).mockResolvedValue(catalog);
  vi.mocked(fetchProductHealth).mockResolvedValue(health);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useCatalogData", () => {
  it("loads all catalog relations and retains backend-provided Product Health states", async () => {
    const { result } = renderHook(() => useCatalogData());
    await flushMicrotasks();

    expect(loadCatalog).toHaveBeenCalledTimes(1);
    expect(fetchProductHealth).toHaveBeenCalledTimes(1);
    expect(result.current.catalog).toEqual(catalog);
    expect(result.current.error).toBe("");
    expect(result.current.itemStatuses).toEqual({ checkout: "down" });
    expect(result.current.itemSignals).toEqual(health.itemSignals);
    expect(result.current.productHealthByItemId.checkout).toEqual(
      health.items[0],
    );
    expect(result.current.lastUpdated).not.toBe("");
  });

  it("starts polling only after a non-empty catalog loads and refreshes every 10 seconds", async () => {
    vi.useFakeTimers();
    let resolveCatalog!: (value: typeof catalog) => void;
    vi.mocked(loadCatalog).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCatalog = resolve;
        }),
    );

    const { result } = renderHook(() => useCatalogData());
    expect(fetchProductHealth).not.toHaveBeenCalled();

    await act(async () => {
      resolveCatalog(catalog);
    });
    expect(fetchProductHealth).toHaveBeenCalledTimes(1);

    vi.mocked(fetchProductHealth).mockResolvedValueOnce({
      ...health,
      itemStatuses: { checkout: "up" },
      itemSignals: { checkout: [] },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999);
    });
    expect(fetchProductHealth).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(fetchProductHealth).toHaveBeenCalledTimes(2);
    expect(result.current.itemStatuses).toEqual({ checkout: "up" });
    expect(result.current.itemSignals.checkout).toEqual([]);
  });

  it("clears stale facts on a failed poll and restores them after recovery", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useCatalogData());
    await flushMicrotasks();

    expect(result.current.itemStatuses.checkout).toBe("down");
    vi.mocked(fetchProductHealth).mockRejectedValueOnce(
      new Error("Product Health is unreachable"),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(log).toHaveBeenCalledOnce();
    expect(result.current.itemStatuses).toEqual({});
    expect(result.current.itemSignals).toEqual({});
    expect(result.current.productHealthByItemId).toEqual({});
    expect(result.current.lastUpdated).toBe("");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.itemStatuses.checkout).toBe("down");
    expect(result.current.itemSignals).toEqual(health.itemSignals);
    expect(result.current.lastUpdated).not.toBe("");
  });

  it("aborts a stalled poll rather than keeping a previous UP/DOWN status", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useCatalogData());
    await flushMicrotasks();
    expect(result.current.itemStatuses.checkout).toBe("down");

    vi.mocked(fetchProductHealth).mockImplementationOnce(
      (signal?: AbortSignal) =>
        new Promise((_, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(18_000);
    });
    expect(fetchProductHealth).toHaveBeenCalledTimes(2);
    expect(result.current.itemStatuses).toEqual({});

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(fetchProductHealth).toHaveBeenCalledTimes(3);
    expect(result.current.itemStatuses).toEqual({ checkout: "down" });
  });

  it("does not poll for an empty catalog", async () => {
    vi.useFakeTimers();
    vi.mocked(loadCatalog).mockResolvedValue({ ...catalog, items: [] });
    const { result } = renderHook(() => useCatalogData());
    await flushMicrotasks();

    expect(result.current.catalog.items).toEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchProductHealth).not.toHaveBeenCalled();
  });

  it("exposes catalog loading errors without starting the health poll", async () => {
    vi.mocked(loadCatalog).mockRejectedValue(
      new Error("Catalog is unavailable"),
    );
    const { result } = renderHook(() => useCatalogData());
    await flushMicrotasks();

    expect(result.current.error).toBe("Catalog is unavailable");
    expect(result.current.catalog.items).toEqual([]);
    expect(fetchProductHealth).not.toHaveBeenCalled();
  });

  it("clears stale health after an unsuccessful poll and retries at the next interval", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useCatalogData());
    await flushMicrotasks();

    vi.mocked(fetchProductHealth).mockRejectedValueOnce(
      new Error("Health is unavailable"),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.itemStatuses).toEqual({});
    expect(log).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchProductHealth).toHaveBeenCalledTimes(3);
    expect(result.current.itemStatuses).toEqual({ checkout: "down" });
    expect(result.current.error).toBe("");
  });

  it("cleans up polling on unmount and ignores an in-flight response", async () => {
    vi.useFakeTimers();
    let resolveHealth!: (value: typeof health) => void;
    vi.mocked(fetchProductHealth).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveHealth = resolve;
        }),
    );
    const clearInterval = vi.spyOn(window, "clearInterval");
    const { unmount } = renderHook(() => useCatalogData());
    await flushMicrotasks();
    expect(fetchProductHealth).toHaveBeenCalledTimes(1);

    unmount();
    expect(clearInterval).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveHealth(health);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchProductHealth).toHaveBeenCalledTimes(1);
  });
});
