/** @vitest-environment jsdom */
/** @file Verifies public runtime settings and validation. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { loadRuntimeConfig } from "./runtimeConfig";

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.__AGGREGATOR_UI__;
});

describe("runtime UI configuration", () => {
  it("loads settings before the initial render", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        appTitle: "Health Aggregator DEMO v0.8.0",
        timelineDefaultRange: "15m",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await loadRuntimeConfig();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/config.json" }),
      { cache: "no-store" },
    );
    expect(window.__AGGREGATOR_UI__).toMatchObject({
      appTitle: "Health Aggregator DEMO v0.8.0",
      timelineDefaultRange: "15m",
    });
    expect(document.title).toBe("Health Aggregator DEMO v0.8.0");
  });

  it("rejects a missing timeline range", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ appTitle: "Demo" }),
    })));
    await expect(loadRuntimeConfig()).rejects.toThrow(
      "Invalid UI runtime configuration",
    );
  });
});
