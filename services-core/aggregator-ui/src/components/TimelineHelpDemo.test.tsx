/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TimelineHelpDemo from "./TimelineHelpDemo";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Timeline help walkthrough", () => {
  it("shows a complete hover-style status popup", () => {
    render(<TimelineHelpDemo />);
    const preview = screen.getByLabelText("Example Timeline");
    expect(within(preview).getByLabelText("States at selected time")).not.toBeNull();
    expect(within(preview).getByText("2026-10-14 23:59:45")).not.toBeNull();
    expect(within(preview).getByText("↳ Payment Gateway · readiness check")).not.toBeNull();
  });

  it("cycles the filter independently and retains Overall", () => {
    vi.useFakeTimers();
    render(<TimelineHelpDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Switch signal groups" }));
    expect(screen.getByLabelText("Signal filter demonstration")).not.toBeNull();
    expect(screen.getAllByText("[Overall]").length).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(1800); });
    expect(screen.getAllByText("[Overall]").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Own").length).toBeGreaterThan(0);
  });

  it("shows a dependency link and simulates opening its Item", () => {
    vi.useFakeTimers();
    render(<TimelineHelpDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Open a dependency" }));
    expect(screen.getByLabelText("Dependency signal details")).not.toBeNull();
    expect(screen.getByText("Item: Payment Gateway")).not.toBeNull();
    act(() => { vi.advanceTimersByTime(3600); });
    expect(screen.getByText("Destination Item")).not.toBeNull();
    expect(screen.getByText("Payment Gateway")).not.toBeNull();
  });
});
