/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TimelineHelpDemo from "./TimelineHelpDemo";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("Timeline help walkthrough", () => {
  it("moves the popup with the cursor and holds it for three seconds", () => {
    render(<TimelineHelpDemo />);
    advance(2700);
    const preview = screen.getByLabelText("Example Timeline");
    const popup = within(preview).getByLabelText("States at selected time");
    expect(within(popup).getByText("↳ Payment Gateway · readiness check")).not.toBeNull();
    const cursor = preview.querySelector(".timeline-help-cursor") as SVGElement;
    const position = cursor.style.left;
    advance(3100);
    expect((preview.querySelector(".timeline-help-cursor") as SVGElement).style.left).toBe(position);
    expect(within(preview).getByLabelText("States at selected time")).not.toBeNull();
  });

  it("opens the selector, filters to two Own and then three Dependencies", () => {
    render(<TimelineHelpDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Switch signal groups" }));
    const preview = screen.getByLabelText("Example Timeline");
    const rowCount = () => preview.querySelectorAll(".timeline-help-track").length;
    expect(rowCount()).toBe(6);
    advance(1100);
    expect(within(preview).getByLabelText("Available signal groups")).not.toBeNull();
    advance(800);
    expect(within(preview).queryByLabelText("Available signal groups")).toBeNull();
    expect(rowCount()).toBe(3);
    expect(preview.querySelectorAll(".timeline-help-track.is-highlighted")).toHaveLength(2);
    advance(2900);
    expect(within(preview).getByLabelText("Available signal groups")).not.toBeNull();
    advance(700);
    expect(rowCount()).toBe(4);
    expect(preview.querySelectorAll(".timeline-help-track.is-highlighted")).toHaveLength(3);
    expect(within(preview).getByText("[Overall] Orders Service")).not.toBeNull();
  });

  it("replaces the hover popup with details then opens a miniature Item", () => {
    render(<TimelineHelpDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Open a dependency" }));
    const preview = screen.getByLabelText("Example Timeline");
    advance(1600);
    expect(within(preview).getByLabelText("States at selected time")).not.toBeNull();
    advance(2100);
    expect(within(preview).queryByLabelText("States at selected time")).toBeNull();
    expect(within(preview).getByLabelText("Dependency signal details")).not.toBeNull();
    expect(within(preview).getByText("Item: Payment Gateway")).not.toBeNull();
    advance(3800);
    const item = within(preview).getByLabelText("Opened Payment Gateway Item");
    expect(within(item).getByText("Payment Gateway")).not.toBeNull();
    expect(within(item).getByText(/Primary contact/)).not.toBeNull();
    expect(within(item).getByText("Actors (2)")).not.toBeNull();
    expect(within(item).getByText("Healthy signals (5)")).not.toBeNull();
    expect(within(item).queryByText(/Back to Orders Service/)).toBeNull();
  });
});
