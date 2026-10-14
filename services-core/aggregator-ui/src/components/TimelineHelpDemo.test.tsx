/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TimelineHelpDemo from "./TimelineHelpDemo";

afterEach(cleanup);

describe("Timeline help scenarios", () => {
  it("shows full names and states for a selected moment", () => {
    render(<TimelineHelpDemo />);

    const readout = screen.getByLabelText("States at selected time");
    expect(within(readout).getByText("Payment Gateway · readiness check")).not.toBeNull();
    expect(within(readout).getAllByText("DOWN").length).toBeGreaterThan(0);
  });

  it("keeps Overall when switching from own to dependency signals", () => {
    render(<TimelineHelpDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Filter signals" }));
    const chart = screen.getByLabelText("Example Timeline");

    fireEvent.click(screen.getByRole("button", { name: "Own" }));
    expect(within(chart).getByText("[Overall]")).not.toBeNull();
    expect(within(chart).getByText("● HTTP availability check")).not.toBeNull();
    expect(within(chart).queryByText("Payment Gateway · readiness check")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Dependencies" }));
    expect(within(chart).getByText("[Overall]")).not.toBeNull();
    expect(within(chart).getByText("Payment Gateway · readiness check")).not.toBeNull();
    expect(within(chart).queryByText("● HTTP availability check")).toBeNull();
  });

  it("shows a simulated Item link for a dependency bar without leaving the dialog", () => {
    render(<TimelineHelpDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Open a dependency" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect Payment Gateway dependency signal" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Payment Gateway ↗" }));
    expect(screen.getByText("Destination Item")).not.toBeNull();
    expect(screen.getByText("Payment Gateway")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Back to Orders Service/ }));
    expect(screen.getByText("[Overall]")).not.toBeNull();
  });
});
