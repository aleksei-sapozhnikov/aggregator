/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TimelineHelpDemo, { getInspectCursorRow } from "./TimelineHelpDemo";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("Timeline help walkthrough", () => {
  it("uses the production timeline wrapper and an isolated Grafana illustration without an iframe", () => {
    const { container } = render(<TimelineHelpDemo />);
    expect(
      container.querySelector(
        ".details-timeline-body .grafana-grid .grafana-panel .grafana-timeline-illustration",
      ),
    ).not.toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    const preview = screen.getByLabelText("Example Timeline");
    expect(
      preview.querySelector(".timeline-help-content")?.hasAttribute("inert"),
    ).toBe(true);
    expect(
      preview.querySelector("a[href], button:not(:disabled), [tabindex='0']"),
    ).toBeNull();
  });

  it("holds a useful static frame in every scenario when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<TimelineHelpDemo />);
    const preview = screen.getByLabelText("Example Timeline");
    expect(
      within(preview).getByLabelText("States at selected time"),
    ).not.toBeNull();
    for (const name of [
      "Inspect a moment",
      "Switch signal groups",
      "Open a dependency",
    ]) {
      fireEvent.click(screen.getByRole("button", { name }));
      const before = preview.innerHTML;
      advance(30000);
      expect(preview.innerHTML).toBe(before);
    }
    expect(preview.querySelector(".help-item-page")).not.toBeNull();
  });
  it("shows the animation directly below scenario buttons without redundant descriptions", () => {
    const { container } = render(<TimelineHelpDemo />);
    const navigation = screen.getByRole("navigation", {
      name: "Timeline help scenarios",
    });
    const preview = screen.getByLabelText("Example Timeline");

    expect(navigation.nextElementSibling).toBe(preview);
    expect(container.querySelector(".timeline-help-description")).toBeNull();
    for (const scenario of [
      "Inspect a moment",
      "Switch signal groups",
      "Open a dependency",
    ]) {
      fireEvent.click(screen.getByRole("button", { name: scenario }));
      expect(navigation.nextElementSibling).toBe(preview);
      expect(container.querySelector(".timeline-help-description")).toBeNull();
      expect(
        screen.getByRole("progressbar", { name: "Animation progress" }),
      ).not.toBeNull();
    }
  });

  it.each([
    ["inspect", "Inspect a moment", 8500],
    ["filter", "Switch signal groups", 12000],
    ["navigate", "Open a dependency", 13000],
  ] as const)(
    "shows cycle progress for %s and resets on scenario switch",
    (_scenario, name, duration) => {
      render(<TimelineHelpDemo />);
      fireEvent.click(screen.getByRole("button", { name }));
      const bar = screen.getByRole("progressbar", {
        name: "Animation progress",
      });
      const fill = document.querySelector(
        ".timeline-help-preview .help-animation-progress-fill",
      ) as HTMLElement;
      expect(bar.getAttribute("aria-valuenow")).toBe("0");
      // The clock advances in 100ms steps, so use a whole tick for odd halves.
      const midpoint = Math.ceil(duration / 200) * 100;
      advance(midpoint);
      const fraction = midpoint / duration;
      expect(bar.getAttribute("aria-valuenow")).toBe(
        String(Math.round(fraction * 100)),
      );
      expect(fill.style.transform).toBe("scaleX(" + fraction + ")");
      advance(duration - midpoint);
      expect(bar.getAttribute("aria-valuenow")).toBe("0");
      expect(fill.style.transform).toBe("scaleX(0)");
      fireEvent.click(screen.getByRole("button", { name: "Inspect a moment" }));
      expect(bar.getAttribute("aria-valuenow")).toBe("0");
    },
  );

  it("uses a one-week range rather than the old fifteen-minute sample", () => {
    render(<TimelineHelpDemo />);
    const preview = screen.getByLabelText("Example Timeline");
    expect(within(preview).getByText("Last 1 week")).not.toBeNull();
    expect(
      within(preview).queryByText(/Example data|Last 15 minutes/),
    ).toBeNull();
    expect(within(preview).getByText("Oct 09")).not.toBeNull();
    expect(within(preview).getByText("Oct 16")).not.toBeNull();
    advance(1400);
    expect(
      within(preview)
        .getByLabelText("States at selected time")
        .querySelector(".timeline-help-popup-date")?.textContent,
    ).toMatch(/^2026-10-/);
  });

  it("moves the inspect pointer down through all graph rows and emphasizes only the current popup name", () => {
    render(<TimelineHelpDemo />);
    const preview = screen.getByLabelText("Example Timeline");
    const cursor = preview.querySelector(
      ".timeline-help-tracks > .timeline-help-cursor",
    ) as SVGElement;
    const labels = [
      "[Overall] Orders Service",
      "● HTTP availability check",
      "● Request success ratio",
      "↳ Payment Gateway · readiness check",
      "↳ Inventory API · synchronization check",
      "↳ Notification Worker · backlog check",
    ];
    const assertActiveRow = (index: number) => {
      const popup = within(preview).getByLabelText("States at selected time");
      const active = popup.querySelectorAll(
        ".timeline-help-popup-row.is-inspected",
      );
      expect(active).toHaveLength(1);
      expect(active[0].getAttribute("data-inspected")).toBe("true");
      expect(
        active[0].querySelector(".timeline-help-popup-name span:last-child")
          ?.textContent,
      ).toBe(labels[index]);
      expect(cursor.style.top).toBe(7 + index * 33 + "px");
      const otherRows = Array.from(
        popup.querySelectorAll(".timeline-help-popup-row"),
      ).filter((row) => row !== active[0]);
      expect(
        otherRows.every((row) => !row.classList.contains("is-inspected")),
      ).toBe(true);
    };

    advance(1500);
    assertActiveRow(0);
    advance(1500);
    expect(cursor.style.left).toBe("50%");
    assertActiveRow(0);

    // Each transition takes 66% of a 760ms step, then holds the selected row.
    advance(680);
    assertActiveRow(1);
    for (let row = 2; row < labels.length; row++) {
      advance(760);
      assertActiveRow(row);
    }
    expect(getInspectCursorRow(6800)).toBe(5);
    advance(700);
    assertActiveRow(5);
  });

  it("moves the popup with the cursor and holds it for three seconds", () => {
    render(<TimelineHelpDemo />);
    advance(2900);
    const preview = screen.getByLabelText("Example Timeline");
    const popup = within(preview).getByLabelText("States at selected time");
    expect(
      within(popup).getByText("↳ Payment Gateway · readiness check"),
    ).not.toBeNull();
    const cursor = preview.querySelector(".timeline-help-cursor") as SVGElement;
    const position = cursor.style.left;
    advance(3100);
    expect(
      (preview.querySelector(".timeline-help-cursor") as SVGElement).style.left,
    ).toBe(position);
    expect(
      within(preview).getByLabelText("States at selected time"),
    ).not.toBeNull();
  });

  it("uses the same playhead position for cursor, line and popup states", () => {
    render(<TimelineHelpDemo />);
    const preview = screen.getByLabelText("Example Timeline");
    const assertAligned = () => {
      const cursor = preview.querySelector(
        ".timeline-help-tracks > .timeline-help-cursor",
      ) as SVGElement;
      const crosshair = preview.querySelector(
        ".timeline-help-tracks > .timeline-help-crosshair",
      ) as HTMLElement;
      const popup = within(preview).getByLabelText("States at selected time");
      expect(cursor.style.left).toBe(crosshair.style.left);
      expect(cursor.style.left).toBe((popup as HTMLElement).style.left);
      const x = Number.parseFloat(cursor.style.left);
      const paymentState = (
        popup.querySelectorAll(".timeline-help-popup-row")[3] as HTMLElement
      ).querySelector("strong")?.textContent;
      const paymentSegment = preview
        .querySelectorAll(".timeline-help-track")[3]
        .querySelectorAll(".timeline-help-state")[Math.floor(x / 20)];
      expect(
        paymentSegment.classList.contains("is-" + paymentState?.toLowerCase()),
      ).toBe(true);
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
    const cursor = preview.querySelector(
      ".timeline-help-tracks > .timeline-help-cursor",
    ) as SVGElement;
    const x = Number.parseFloat(cursor.style.left);
    expect(x).toBe(50);
    expect(popup.classList.contains("is-flipped")).toBe(true);
    const states = within(popup)
      .getAllByText(/^(UP|DOWN|UNKNOWN)$/)
      .map((node) => node.textContent);
    expect(new Set(states)).toEqual(new Set(["UP", "DOWN", "UNKNOWN"]));

    advance(3100);
    expect(
      (
        preview.querySelector(
          ".timeline-help-tracks > .timeline-help-cursor",
        ) as SVGElement
      ).style.left,
    ).toBe("50%");
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

  it("renders a white cursor with a dark outline in both themes", () => {
    document.body.dataset.theme = "dark";
    try {
      render(<TimelineHelpDemo />);
      const cursor = screen
        .getByLabelText("Example Timeline")
        .querySelector(".timeline-help-cursor path");
      expect(cursor?.getAttribute("fill")).toBe("#ffffff");
      expect(cursor?.getAttribute("stroke")).toBe("#151515");
    } finally {
      delete document.body.dataset.theme;
    }
  });

  it("omits the status legend from the demonstration", () => {
    render(<TimelineHelpDemo />);
    expect(screen.queryByLabelText("Timeline status colors")).toBeNull();
  });

  it("opens the selector, filters to two Own and then three Dependencies", () => {
    render(<TimelineHelpDemo />);
    fireEvent.click(
      screen.getByRole("button", { name: "Switch signal groups" }),
    );
    const preview = screen.getByLabelText("Example Timeline");
    const rowCount = () =>
      preview.querySelectorAll(".timeline-help-track").length;
    expect(rowCount()).toBe(6);
    advance(1100);
    expect(
      within(preview).getByLabelText("Available signal groups"),
    ).not.toBeNull();
    advance(800);
    expect(
      within(preview).queryByLabelText("Available signal groups"),
    ).toBeNull();
    expect(rowCount()).toBe(3);
    expect(
      preview.querySelectorAll(".timeline-help-track.is-highlighted"),
    ).toHaveLength(2);
    advance(2900);
    expect(
      within(preview).getByLabelText("Available signal groups"),
    ).not.toBeNull();
    advance(700);
    expect(rowCount()).toBe(4);
    expect(
      preview.querySelectorAll(".timeline-help-track.is-highlighted"),
    ).toHaveLength(3);
    expect(
      within(preview).getByText("[Overall] Orders Service"),
    ).not.toBeNull();

    advance(3000);
    const menu = within(preview).getByLabelText("Available signal groups");
    expect(
      menu.querySelector(".timeline-help-option.is-targeted")?.textContent,
    ).toContain("All");
    expect(rowCount()).toBe(4);

    advance(700);
    expect(
      within(preview).queryByLabelText("Available signal groups"),
    ).toBeNull();
    expect(rowCount()).toBe(6);
    expect(
      preview.querySelectorAll(".timeline-help-track.is-highlighted"),
    ).toHaveLength(0);

    advance(3000);
    expect(rowCount()).toBe(6);
    expect(
      within(preview).queryByLabelText("Available signal groups"),
    ).toBeNull();
  });

  it("bolds Payment Gateway readiness check while the cursor is on its graph", () => {
    render(<TimelineHelpDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Open a dependency" }));
    const preview = screen.getByLabelText("Example Timeline");
    const cursor = preview.querySelector(
      ".timeline-help-tracks > .timeline-help-cursor",
    ) as SVGElement;

    advance(1600);
    expect(cursor.style.top).toBe("107px");
    const hover = within(preview).getByLabelText("States at selected time");
    const activeHoverRows = hover.querySelectorAll(
      ".timeline-help-popup-row.is-inspected",
    );
    expect(activeHoverRows).toHaveLength(1);
    expect(activeHoverRows[0].textContent).toContain(
      "Payment Gateway · readiness check",
    );
    expect(
      activeHoverRows[0].querySelector(
        ".timeline-help-popup-name span:last-child",
      )?.textContent,
    ).toBe("↳ Payment Gateway · readiness check");

    advance(2000);
    const details = within(preview).getByLabelText("Dependency signal details");
    const detailRow = details.querySelector(
      ".timeline-help-popup-row",
    ) as HTMLElement;
    expect(detailRow.classList.contains("is-inspected")).toBe(true);
    expect(detailRow.getAttribute("data-inspected")).toBe("true");
    expect(cursor.style.top).toBe("107px");

    // As the pointer moves to the Item link, the signal is no longer selected.
    advance(1600);
    expect(cursor.classList.contains("is-moving-to-link")).toBe(true);
    expect(detailRow.classList.contains("is-inspected")).toBe(false);
    expect(detailRow.hasAttribute("data-inspected")).toBe(false);
  });

  it("replaces the hover popup with details then opens a miniature Item", () => {
    render(<TimelineHelpDemo />);
    fireEvent.click(screen.getByRole("button", { name: "Open a dependency" }));
    const preview = screen.getByLabelText("Example Timeline");
    advance(1600);
    expect(
      within(preview).getByLabelText("States at selected time"),
    ).not.toBeNull();
    const signalRows = preview.querySelectorAll(".timeline-help-track");
    // Payment Gateway is row four: three 26px rows plus three 7px gaps.
    expect(signalRows).toHaveLength(6);
    const cursor = preview.querySelector(
      ".timeline-help-tracks > .timeline-help-cursor",
    ) as SVGElement;
    expect(cursor.style.top).toBe("107px");
    expect(
      within(preview).getAllByText("↳ Payment Gateway · readiness check")
        .length,
    ).toBeGreaterThan(0);
    advance(1700);
    const graphCursor = preview.querySelector(
      ".timeline-help-tracks > .timeline-help-cursor",
    ) as SVGElement;
    const originalLeft = graphCursor.style.left;
    const originalTop = graphCursor.style.top;
    // The graph playhead has stopped; opening details must not move the cursor.
    advance(400);
    expect(
      within(preview).queryByLabelText("States at selected time"),
    ).toBeNull();
    expect(
      within(preview).getByLabelText("Dependency signal details"),
    ).not.toBeNull();
    const link = within(preview).getByText("Item: Payment Gateway");
    expect(link.querySelector(".timeline-help-cursor")).toBeNull();
    const sameCursor = preview.querySelector(
      ".timeline-help-tracks > .timeline-help-cursor",
    ) as SVGElement;
    expect(sameCursor).toBe(graphCursor);
    expect(sameCursor.style.left).toBe(originalLeft);
    expect(sameCursor.style.top).toBe(originalTop);
    expect(sameCursor.classList.contains("is-moving-to-link")).toBe(false);

    advance(1500);
    expect(sameCursor.classList.contains("is-moving-to-link")).toBe(true);
    expect(sameCursor.style.left).toContain(
      "--timeline-help-dependency-popup-width",
    );
    advance(1500);
    expect(sameCursor.classList.contains("is-pressed")).toBe(true);
    advance(800);
    const item = within(preview).getByLabelText("Opened Payment Gateway Item");
    expect(item.querySelector(".content-title")?.textContent).toContain(
      "Payment Gateway",
    );
    expect(within(item).getByText(/Primary contact/)).not.toBeNull();
    expect(within(item).getByText("Actors (2)")).not.toBeNull();
    expect(within(item).getByText("Healthy signals (5)")).not.toBeNull();
    expect(within(item).queryByText(/Back to Orders Service/)).toBeNull();
  });
});
