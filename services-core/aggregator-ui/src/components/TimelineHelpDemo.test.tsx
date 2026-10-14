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

  it("uses the same playhead position for cursor, line and popup states", () => {
    render(<TimelineHelpDemo />);
    const preview = screen.getByLabelText("Example Timeline");
    const assertAligned = () => {
      const cursor = preview.querySelector(".timeline-help-tracks > .timeline-help-cursor") as SVGElement;
      const crosshair = preview.querySelector(".timeline-help-tracks > .timeline-help-crosshair") as HTMLElement;
      const popup = within(preview).getByLabelText("States at selected time");
      expect(cursor.style.left).toBe(crosshair.style.left);
      expect(cursor.style.left).toBe((popup as HTMLElement).style.left);
      const x = Number.parseFloat(cursor.style.left);
      const paymentState = (popup.querySelectorAll(".timeline-help-popup-row")[3] as HTMLElement)
        .querySelector("strong")?.textContent;
      const paymentSegment = preview.querySelectorAll(".timeline-help-track")[3]
        .querySelectorAll(".timeline-help-state")[Math.floor(x / 20)];
      expect(paymentSegment.classList.contains("is-" + paymentState?.toLowerCase())).toBe(true);
      return { x, paymentState };
    };

    advance(1900);
    const earlier = assertAligned();
    expect(earlier.paymentState).toBe("UP");
    advance(1000);
    const later = assertAligned();
    expect(later.x).toBeGreaterThan(earlier.x);
    expect(later.paymentState).toBe("DOWN");
    advance(3100);
    expect(assertAligned().x).toBe(later.x);
  });

  it("shows all three states at the stop point and flips the popup to the left", () => {
    render(<TimelineHelpDemo />);
    const preview = screen.getByLabelText("Example Timeline");

    advance(2900);
    const popup = within(preview).getByLabelText("States at selected time");
    const cursor = preview.querySelector(".timeline-help-tracks > .timeline-help-cursor") as SVGElement;
    const x = Number.parseFloat(cursor.style.left);
    expect(x).toBe(50);
    expect(popup.classList.contains("is-flipped")).toBe(true);
    const states = within(popup)
      .getAllByText(/^(UP|DOWN|UNKNOWN)$/)
      .map((node) => node.textContent);
    expect(new Set(states)).toEqual(new Set(["UP", "DOWN", "UNKNOWN"]));

    advance(3100);
    expect((preview.querySelector(".timeline-help-tracks > .timeline-help-cursor") as SVGElement).style.left).toBe("50%");
  });

  it("renders the destination Item with Timeline collapsed", () => {
    render(<TimelineHelpDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Open a dependency" }));
    advance(7400);
    const item = screen.getByLabelText("Opened Payment Gateway Item");
    const timeline = within(item).getByText("Timeline");
    expect(timeline.parentElement?.textContent).toContain("›");
    expect(timeline.parentElement?.textContent).not.toContain("⌄");
    expect(item.querySelector(".timeline-help-chart")).toBeNull();
  });

  it("omits the status legend from the demonstration", () => {
    render(<TimelineHelpDemo />);
    expect(screen.queryByLabelText("Timeline status colors")).toBeNull();
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

    advance(3000);
    const menu = within(preview).getByLabelText("Available signal groups");
    expect(menu.querySelector(".timeline-help-option.is-targeted")?.textContent).toContain("All");
    expect(rowCount()).toBe(4);

    advance(700);
    expect(within(preview).queryByLabelText("Available signal groups")).toBeNull();
    expect(rowCount()).toBe(6);
    expect(preview.querySelectorAll(".timeline-help-track.is-highlighted")).toHaveLength(0);

    advance(3000);
    expect(rowCount()).toBe(6);
    expect(within(preview).queryByLabelText("Available signal groups")).toBeNull();
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
    const link = within(preview).getByText("Item: Payment Gateway");
    expect(link.querySelector(".timeline-help-cursor")).not.toBeNull();
    advance(3800);
    const item = within(preview).getByLabelText("Opened Payment Gateway Item");
    expect(within(item).getByText("Payment Gateway")).not.toBeNull();
    expect(within(item).getByText(/Primary contact/)).not.toBeNull();
    expect(within(item).getByText("Actors (2)")).not.toBeNull();
    expect(within(item).getByText("Healthy signals (5)")).not.toBeNull();
    expect(within(item).queryByText(/Back to Orders Service/)).toBeNull();
  });
});
