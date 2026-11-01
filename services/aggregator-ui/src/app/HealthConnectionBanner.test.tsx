/** @vitest-environment jsdom */
/** @file Verifies Product Health transport errors are explained separately. */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HealthConnectionBanner from "./HealthConnectionBanner";

afterEach(cleanup);

describe("HealthConnectionBanner", () => {
  it("does not appear while connecting or when data is current", () => {
    const { rerender } = render(
      <HealthConnectionBanner
        connectionStatus="connecting"
        lastSuccessfulFetchAt={null}
        disconnectedDetectedAt={null}
      />,
    );
    expect(screen.queryByRole("status")).toBeNull();
    rerender(
      <HealthConnectionBanner
        connectionStatus="connected"
        lastSuccessfulFetchAt={1000}
        disconnectedDetectedAt={null}
      />,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("displays last successful data and the first detected connection failure", () => {
    const lastData = Date.parse("2026-10-17T15:42:10Z");
    const detected = Date.parse("2026-10-17T15:42:20Z");
    render(
      <HealthConnectionBanner
        connectionStatus="disconnected"
        lastSuccessfulFetchAt={lastData}
        disconnectedDetectedAt={detected}
      />,
    );
    const alert = screen.getByRole("status");
    expect(alert.textContent).toContain("DISCONNECTED");
    expect(alert.textContent).toContain(
      new Date(lastData).toLocaleTimeString(),
    );
    expect(alert.textContent).toContain(
      new Date(detected).toLocaleTimeString(),
    );
    expect(alert.textContent).toContain("Showing last known health");
  });

  it("does not claim a snapshot exists if every Product Health request failed", () => {
    render(
      <HealthConnectionBanner
        connectionStatus="disconnected"
        lastSuccessfulFetchAt={null}
        disconnectedDetectedAt={Date.now()}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "No Product Health data has been received yet.",
    );
  });
});
