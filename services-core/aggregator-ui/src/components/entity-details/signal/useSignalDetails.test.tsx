/** @vitest-environment jsdom */
/** @file Tests signal modal deep-link synchronization. */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import useSignalDetails from "./useSignalDetails";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("Signal details routing", () => {
  it("opens signal details without changing the selected Item route", () => {
    window.history.replaceState({}, "", "/item/checkout");
    const { result } = renderHook(() => useSignalDetails());
    act(() =>
      result.current.openSignal({
        id: "latency",
        title: "Latency",
        status: "down",
      }),
    );
    expect(result.current.openedSignalId).toBe("latency");
    expect(result.current.openedSignalTitle).toBe("Latency");
    expect(window.location.pathname).toBe("/item/checkout");
    expect(window.location.hash).toBe("#signal/latency");
    act(() => result.current.closeSignal());
    expect(result.current.openedSignalId).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("restores deep links and responds to external history changes", () => {
    window.history.replaceState({}, "", "/item/checkout#signal/errors");
    const { result } = renderHook(() => useSignalDetails());
    expect(result.current.openedSignalId).toBe("errors");
    window.history.replaceState({}, "", "/item/payments#signal/readiness");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(result.current.openedSignalId).toBe("readiness");
    expect(result.current.openedSignalTitle).toBe("");
    window.history.replaceState({}, "", "/item/payments");
    act(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
    expect(result.current.openedSignalId).toBe("");
  });
});
