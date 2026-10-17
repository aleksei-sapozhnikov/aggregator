/** @vitest-environment jsdom */
/** @file Tests health signal propagation examples and shared scene presentation. */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HealthySignalsHelpDemo from "../../healthy-signals/HealthySignalsHelpDemo";
import UnhealthySignalsHelpDemo from "../../unhealthy-signals/UnhealthySignalsHelpDemo";
import { unhealthyTiming } from "../../unhealthy-signals/UnhealthySignalTiming";
import { expandedListHoldMs } from "./progress";
import { unhealthyCycleDuration } from "../../unhealthy-signals/UnhealthySignalProjection";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const advance = (milliseconds: number) =>
  act(() => vi.advanceTimersByTime(milliseconds));
const getNode = (id: string) =>
  document.querySelector(`[data-flow-node="${id}"]`) as Element;
const getProgress = (id: string) =>
  Number(
    document
      .querySelector(
        `[data-flow-edge="${id}"] .signal-flow-help-propagation:not(.is-recovery)`,
      )
      ?.getAttribute("data-progress") || 0,
  );
const getRecoveryProgress = (id: string) =>
  Number(
    document
      .querySelector(
        `[data-flow-edge="${id}"] .signal-flow-help-propagation.is-recovery`,
      )
      ?.getAttribute("data-recovery-progress") || 0,
  );

describe("Signal flow help demonstrations", () => {
  it.each(["healthy", "unhealthy"] as const)(
    "uses passive production HTML and an illustrative graph in %s mode",
    (mode) => {
      const { container } = render(
        mode === "healthy" ? (
          <HealthySignalsHelpDemo />
        ) : (
          <UnhealthySignalsHelpDemo />
        ),
      );
      const page = container.querySelector(".help-item-page") as HTMLElement;
      const canvas = container.querySelector(".signal-flow-help");
      expect(canvas?.classList.contains("help-animation-canvas")).toBe(true);
      expect(canvas?.getAttribute("style")).toContain("660px");
      expect(page.closest("svg")).toBeNull();
      expect(page.querySelector(".content-title")?.textContent).toContain(
        "client-service",
      );
      expect(page.querySelector(".primary-contact-link")?.textContent).toBe(
        "support@client-service",
      );
      expect(page.hasAttribute("inert")).toBe(true);
      expect(
        page.querySelector("a[href], button:not(:disabled), [tabindex='0']"),
      ).toBeNull();
      expect(container.querySelectorAll("[data-flow-node]")).toHaveLength(6);
      expect(container.querySelectorAll("[data-flow-edge]")).toHaveLength(5);
      expect(
        container.querySelector(".help-interaction-shield"),
      ).not.toBeNull();
      expect(container.querySelector("foreignObject")).toBeNull();
      if (mode === "healthy") {
        expect(page.querySelectorAll(".signals-healthy-row")).toHaveLength(3);
        expect(page.querySelector(".signals-healthy-list")?.textContent).toBe(
          "AvailabilitySuccess ratioLatency",
        );
        expect(container.querySelectorAll("[data-own-signal]")).toHaveLength(3);
      } else {
        expect(page.querySelectorAll(".signals-incident-row")).toHaveLength(2);
        expect(page.querySelectorAll(".signals-incident-signal")).toHaveLength(
          2,
        );
        expect(
          page.querySelector(".details-unhealthy-list")?.textContent,
        ).toContain("client-ux→DependencyError rate");
      }
    },
  );

  it.each([
    ["healthy", 15000],
    ["unhealthy", unhealthyCycleDuration],
  ] as const)("preserves the %s cycle and progress reset", (mode, duration) => {
    render(
      mode === "healthy" ? (
        <HealthySignalsHelpDemo />
      ) : (
        <UnhealthySignalsHelpDemo />
      ),
    );
    const bar = screen.getByRole("progressbar", { name: "Animation progress" });
    const midpoint = Math.round(duration / 40) * 20;
    advance(midpoint);
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
    advance(duration - midpoint);
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    advance(300);
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  });

  it.each([
    ["healthy", 6500, '[data-selection-frame="availability"]'],
    [
      "unhealthy",
      unhealthyTiming.pageHoldAt + 10,
      '[data-unhealthy-frame="item"]',
    ],
  ] as const)(
    "keeps %s selection frames visible during the two-second hold",
    (mode, start, selector) => {
      const { container } = render(
        mode === "healthy" ? (
          <HealthySignalsHelpDemo />
        ) : (
          <UnhealthySignalsHelpDemo />
        ),
      );
      const page = container.querySelector(".help-item-page") as HTMLElement;
      const frame = container.querySelector(selector) as Element;
      expect(frame.classList.contains("demo-highlight-frame")).toBe(true);
      const progress = screen.getByRole("progressbar", {
        name: "Animation progress",
      });
      advance(start);
      expect(page.style.opacity).toBe("1");
      expect(frame.getAttribute("opacity")).toBe("1");
      const before = Number(progress.getAttribute("aria-valuenow"));
      advance(1000);
      expect(page.style.opacity).toBe("1");
      expect(frame.getAttribute("opacity")).toBe("1");
      advance(mode === "unhealthy" ? 980 : 1000);
      expect(page.style.opacity).toBe("1");
      expect(frame.getAttribute("opacity")).toBe("1");
      expect(Number(progress.getAttribute("aria-valuenow"))).toBeGreaterThan(
        before,
      );
    },
  );

  it.each(["healthy", "unhealthy"] as const)(
    "updates the %s animation between old 100ms ticks",
    (mode) => {
      const { container } = render(
        mode === "healthy" ? (
          <HealthySignalsHelpDemo />
        ) : (
          <UnhealthySignalsHelpDemo />
        ),
      );
      const selector =
        mode === "healthy"
          ? '[data-selection-frame="availability"]'
          : '[data-flow-edge="nested1-dep1"] .signal-flow-help-propagation';
      advance(mode === "healthy" ? 3560 : 2540);
      const before = container.querySelector(selector);
      const coordinate = mode === "healthy" ? "x" : "stroke-dashoffset";
      const first = before?.getAttribute(coordinate);
      advance(20);
      const after = container.querySelector(selector);
      expect(after?.getAttribute(coordinate)).not.toBe(first);
    },
  );

  it.each([
    ["healthy", '[data-selection-frame="availability"]', 6500],
    [
      "unhealthy",
      '[data-unhealthy-frame="dep1"]',
      unhealthyTiming.pageHoldAt + 10,
    ],
    [
      "unhealthy",
      '[data-unhealthy-frame="nested1"]',
      unhealthyTiming.pageHoldAt + 10,
    ],
  ] as const)(
    "adds left and right text gutters around %s signal rows",
    (mode, selector, holdAt) => {
      const { container } = render(
        mode === "healthy" ? (
          <HealthySignalsHelpDemo />
        ) : (
          <UnhealthySignalsHelpDemo />
        ),
      );
      advance(holdAt);
      const frame = container.querySelector(selector) as SVGRectElement;
      // No geometry is available in jsdom: the scene uses the target fallback,
      // scaled into the SVG by the production preview layout.
      const left = 95 + 72 * 0.9;
      const right = left + 408 * 0.9;
      expect(Number(frame.getAttribute("x"))).toBeCloseTo(left - 16);
      expect(
        Number(frame.getAttribute("x")) + Number(frame.getAttribute("width")),
      ).toBeCloseTo(right + 12);
    },
  );

  it("keeps neighboring unhealthy dependency highlights separated", () => {
    const { container } = render(<UnhealthySignalsHelpDemo />);
    const upper = container.querySelector(
      '[data-unhealthy-frame="dep1"]',
    ) as SVGRectElement;
    const lower = container.querySelector(
      '[data-unhealthy-frame="nested1"]',
    ) as SVGRectElement;
    let previousTime = 0;
    for (const time of [6200, 6370, 8370, 9000]) {
      advance(time - previousTime);
      previousTime = time;
      const upperBottom =
        Number(upper.getAttribute("y")) + Number(upper.getAttribute("height"));
      const lowerTop = Number(lower.getAttribute("y"));
      expect(lowerTop - upperBottom).toBeGreaterThanOrEqual(6);
    }
    expect(upper.getAttribute("opacity")).toBe("1");
    expect(lower.getAttribute("opacity")).toBe("1");
    expect(upper.classList.contains("demo-highlight-frame")).toBe(true);
    expect(lower.classList.contains("demo-highlight-frame")).toBe(true);
  });

  it("selects the entire healthy Item and moves that frame to its Aggregator title", () => {
    const { container } = render(<HealthySignalsHelpDemo />);
    const item = container.querySelector(
      '[data-healthy-frame="item"]',
    ) as SVGRectElement;
    const source = container.querySelector(
      '[data-flow-node="item"] .signal-flow-help-node-frame',
    ) as SVGRectElement;
    const signals = container.querySelectorAll("[data-selection-frame]");
    const page = container.querySelector(".help-item-page") as HTMLElement;
    expect(item).not.toBeNull();
    expect(signals).toHaveLength(3);

    advance(2900);
    expect(item.getAttribute("opacity")).toBe("1");
    const sourceX = Number(item.getAttribute("x"));
    const sourceY = Number(item.getAttribute("y"));
    const sourceWidth = Number(item.getAttribute("width"));
    const sourceHeight = Number(item.getAttribute("height"));
    expect(sourceX).toBeLessThan(Number(source.getAttribute("x")));
    expect(sourceY).toBeLessThan(Number(source.getAttribute("y")));
    expect(sourceX + sourceWidth).toBeGreaterThan(
      Number(source.getAttribute("x")) + Number(source.getAttribute("width")),
    );
    expect(sourceY + sourceHeight).toBeGreaterThan(
      Number(source.getAttribute("y")) + Number(source.getAttribute("height")),
    );

    advance(1350);
    expect(Number(item.getAttribute("x"))).toBeGreaterThan(95);
    expect(Number(item.getAttribute("x"))).toBeLessThan(sourceX);
    expect(Number(item.getAttribute("width"))).toBeGreaterThan(sourceWidth);
    expect(Number(page.style.opacity)).toBeGreaterThan(0);
    expect(Number(page.style.opacity)).toBeLessThan(1);

    advance(2250);
    expect(page.style.opacity).toBe("1");
    // In jsdom, target measuring falls back to the production preview layout.
    const titleLeft = 95 + 20 * 0.9;
    const titleTop = 20 * 0.9;
    const titleWidth = 460 * 0.9;
    const titleHeight = 27 * 0.9;
    expect(Number(item.getAttribute("x"))).toBeCloseTo(titleLeft - 16);
    expect(Number(item.getAttribute("y"))).toBeCloseTo(titleTop - 5);
    expect(Number(item.getAttribute("width"))).toBeCloseTo(titleWidth + 28);
    expect(Number(item.getAttribute("height"))).toBeCloseTo(titleHeight + 10);
    expect(item.getAttribute("opacity")).toBe("1");

    advance(expandedListHoldMs);
    expect(page.style.opacity).toBe("1");
    expect(item.getAttribute("opacity")).toBe("1");

    advance(2800);
    expect(page.style.opacity).toBe("0");
    expect(Number(item.getAttribute("x"))).toBeCloseTo(sourceX);
    expect(Number(item.getAttribute("width"))).toBeCloseTo(sourceWidth);
    expect(item.getAttribute("opacity")).toBe("1");

    advance(1800);
    expect(item.getAttribute("opacity")).toBe("0");
    expect(container.querySelectorAll("[data-selection-frame]")).toHaveLength(
      3,
    );
  });

  it("moves the Item's checks toward the healthy rows and returns them to the graph", () => {
    const { container } = render(<HealthySignalsHelpDemo />);
    const checks = Array.from(container.querySelectorAll("[data-own-signal]"));
    const frame = container.querySelector(
      '[data-selection-frame="availability"]',
    ) as Element;
    const glyph = checks[0].querySelector("text") as Element;
    const page = container.querySelector(".help-item-page") as HTMLElement;
    const graph = container.querySelector(
      ".signal-flow-help-graph",
    ) as SVGElement;
    const startX = frame.getAttribute("x");
    advance(2900);
    expect(frame.getAttribute("opacity")).toBe("1");
    advance(3600);
    expect(frame.getAttribute("x")).not.toBe(startX);
    expect(page.style.opacity).toBe("1");
    expect(graph.style.opacity).toBe("0");
    expect(glyph.getAttribute("opacity")).toBe("0");
    // The page has real signal controls, without an SVG replica of their names.
    expect(
      container.querySelectorAll("svg .signal-flow-help-page-link"),
    ).toHaveLength(0);
    advance(5900);
    expect(page.style.opacity).toBe("0");
    expect(graph.style.opacity).toBe("1");
    expect(frame.getAttribute("x")).toBe(startX);
    expect(glyph.getAttribute("opacity")).toBe("1");
    expect(checks.every((check) => check.isConnected)).toBe(true);
  });

  it("projects dependency nodes into shared grouped signal rows and returns them intact", () => {
    const { container } = render(<UnhealthySignalsHelpDemo />);
    const page = container.querySelector(".help-item-page") as HTMLElement;
    const groups = [getNode("item"), getNode("dep1"), getNode("nested1")];
    const box = groups[1].querySelector(
      ".signal-flow-help-node-frame",
    ) as Element;
    const startX = box.getAttribute("x");
    advance(5520);
    expect(Number(page.style.opacity)).toBeGreaterThan(0);
    expect(Number(page.style.opacity)).toBeLessThan(1);
    expect(box.getAttribute("x")).not.toBe(startX);
    advance(860);
    expect(page.style.opacity).toBe("1");
    expect(box.getAttribute("opacity")).toBe("0");
    expect(page.querySelectorAll(".item-navigation-link")).toHaveLength(2);
    expect(page.querySelectorAll(".signal-name")).toHaveLength(2);
    expect(page.querySelector(".content-status-label")?.textContent).toBe(
      "DOWN",
    );
    advance(expandedListHoldMs - 20);
    expect(page.style.opacity).toBe("1");
    advance(unhealthyTiming.reverseEnd - unhealthyTiming.reverseStart + 40);
    expect(page.style.opacity).toBe("0");
    expect(box.getAttribute("x")).toBe(startX);
    expect(groups.every((group) => group.isConnected)).toBe(true);
  });

  it.each(["healthy", "unhealthy"] as const)(
    "enlarges the %s page within a narrow scene",
    (mode) => {
      vi.spyOn(
        HTMLElement.prototype,
        "getBoundingClientRect",
      ).mockImplementation(
        () =>
          ({
            width: 320,
            height: 215,
            left: 0,
            top: 0,
            toJSON: () => ({}),
          }) as DOMRect,
      );
      const { container } = render(
        mode === "healthy" ? (
          <HealthySignalsHelpDemo />
        ) : (
          <UnhealthySignalsHelpDemo />
        ),
      );
      const page = container.querySelector(".help-item-page") as HTMLElement;
      expect(
        container
          .querySelector(".signal-flow-help-diagram")
          ?.getAttribute("data-page-layout"),
      ).toBe("compact");
      expect(page.style.transform).toBe("scale(1.2)");
      expect(
        (container.querySelector(".help-scene-canvas") as HTMLElement).style
          .transform,
      ).toContain("scale(0.5)");
      expect(container.innerHTML).not.toContain("NaN");
    },
  );

  it.each(["healthy", "unhealthy"] as const)(
    "holds the %s page when reduced motion is requested",
    (mode) => {
      vi.stubGlobal("matchMedia", () => ({ matches: true }));
      const { container } = render(
        mode === "healthy" ? (
          <HealthySignalsHelpDemo />
        ) : (
          <UnhealthySignalsHelpDemo />
        ),
      );
      expect(
        (container.querySelector(".help-item-page") as HTMLElement).style
          .opacity,
      ).toBe("1");
      const before = container.innerHTML;
      advance(30000);
      expect(container.innerHTML).toBe(before);
    },
  );

  it("turns each dependent node red exactly when its incoming wave arrives", () => {
    render(<UnhealthySignalsHelpDemo />);
    const {
      firstLinkStart,
      dependencyAffectedAt,
      secondLinkStart,
      itemAffectedAt,
    } = unhealthyTiming;

    expect(getNode("nested1").getAttribute("data-health")).toBe("healthy");
    expect(getNode("dep1").getAttribute("data-health")).toBe("healthy");
    expect(getNode("item").getAttribute("data-health")).toBe("healthy");

    advance(unhealthyTiming.failureStart);
    expect(getNode("nested1").getAttribute("data-health")).toBe("unhealthy");
    expect(document.querySelectorAll("[data-failing-check]")).toHaveLength(1);
    expect(getNode("dep1").getAttribute("data-health")).toBe("healthy");

    advance(firstLinkStart - unhealthyTiming.failureStart);
    expect(getProgress("nested1-dep1")).toBe(0);
    advance(400);
    expect(getProgress("nested1-dep1")).toBeGreaterThan(0);
    expect(getProgress("nested1-dep1")).toBeLessThan(100);
    expect(getNode("dep1").getAttribute("data-health")).toBe("healthy");

    advance(dependencyAffectedAt - firstLinkStart - 400 - 20);
    expect(getNode("dep1").getAttribute("data-health")).toBe("healthy");
    advance(20);
    expect(getProgress("nested1-dep1")).toBe(100);
    expect(getNode("dep1").getAttribute("data-health")).toBe("unhealthy");
    expect(getNode("item").getAttribute("data-health")).toBe("healthy");

    // Keep the original 500 ms pause after the dependency turns red.
    advance(secondLinkStart - dependencyAffectedAt);
    expect(getProgress("dep1-item")).toBe(0);
    expect(getNode("item").getAttribute("data-health")).toBe("healthy");
    advance(400);
    expect(getProgress("dep1-item")).toBeGreaterThan(0);
    expect(getProgress("dep1-item")).toBeLessThan(100);
    advance(itemAffectedAt - secondLinkStart - 400 - 20);
    expect(getNode("item").getAttribute("data-health")).toBe("healthy");
    advance(20);
    expect(getProgress("dep1-item")).toBe(100);
    expect(getNode("item").getAttribute("data-health")).toBe("unhealthy");
    expect(getNode("dep2").getAttribute("data-health")).toBe("healthy");
    expect(getNode("nested2").getAttribute("data-health")).toBe("healthy");

    advance(unhealthyTiming.presentationStart - itemAffectedAt - 20);
    expect(getNode("item").getAttribute("data-health")).toBe("unhealthy");
    advance(20);
    expect(getNode("item").getAttribute("data-health")).toBe("unhealthy");
  });

  it("keeps selection frames within the original unhealthy node outlines", () => {
    const { container } = render(<UnhealthySignalsHelpDemo />);
    for (const name of ["item", "dep1", "nested1"]) {
      const frame = container.querySelector(
        `[data-unhealthy-frame="${name}"]`,
      ) as SVGRectElement;
      const node = container.querySelector(
        `[data-unhealthy-source="${name}"] .signal-flow-help-node-frame`,
      ) as SVGRectElement;
      expect(Number(frame.getAttribute("x"))).toBeGreaterThan(
        Number(node.getAttribute("x")),
      );
      expect(Number(frame.getAttribute("y"))).toBeGreaterThan(
        Number(node.getAttribute("y")),
      );
      expect(
        Number(frame.getAttribute("x")) + Number(frame.getAttribute("width")),
      ).toBeLessThan(
        Number(node.getAttribute("x")) + Number(node.getAttribute("width")),
      );
      expect(
        Number(frame.getAttribute("y")) + Number(frame.getAttribute("height")),
      ).toBeLessThan(
        Number(node.getAttribute("y")) + Number(node.getAttribute("height")),
      );
    }
  });

  it("holds the complete red graph for 250 ms and the Item for 2 seconds", () => {
    const { container } = render(<UnhealthySignalsHelpDemo />);
    const graph = container.querySelector(
      ".signal-flow-help-graph",
    ) as HTMLElement;
    const page = container.querySelector(".help-item-page") as HTMLElement;

    expect(
      unhealthyTiming.presentationStart - unhealthyTiming.itemAffectedAt,
    ).toBe(250);
    advance(unhealthyTiming.itemAffectedAt);
    expect(getNode("item").getAttribute("data-health")).toBe("unhealthy");
    expect(page.style.opacity).toBe("0");
    advance(240);
    expect(page.style.opacity).toBe("0");

    advance(
      unhealthyTiming.pageHoldAt - unhealthyTiming.itemAffectedAt - 240 + 20,
    );
    expect(page.style.opacity).toBe("1");
    expect(graph.style.opacity).toBe("0");
    advance(expandedListHoldMs - 20);
    expect(page.style.opacity).toBe("1");
    expect(graph.style.opacity).toBe("0");
    advance(40);
    expect(Number(page.style.opacity)).toBeLessThan(1);
    expect(Number(graph.style.opacity)).toBeGreaterThan(0);
  });

  it("restores nodes when equally fast green waves arrive, then resets", () => {
    const { container } = render(<UnhealthySignalsHelpDemo />);
    const graph = container.querySelector(
      ".signal-flow-help-graph",
    ) as SVGGElement;
    const first = container.querySelector(
      '[data-flow-edge="nested1-dep1"]',
    ) as SVGGElement;
    const second = container.querySelector(
      '[data-flow-edge="dep1-item"]',
    ) as SVGGElement;
    const t = unhealthyTiming;
    const actualTime = (sceneTime: number) => sceneTime + expandedListHoldMs;

    expect(t.firstRecoveryEnd - t.firstRecoveryStart).toBe(
      t.firstLinkEnd - t.firstLinkStart,
    );
    expect(t.secondRecoveryEnd - t.secondRecoveryStart).toBe(
      t.secondLinkEnd - t.secondLinkStart,
    );

    advance(actualTime(t.leafRecoveredAt) - 20);
    expect(graph.style.opacity).toBe("1");
    expect(getNode("nested1").getAttribute("data-health")).toBe("unhealthy");
    expect(getNode("dep1").getAttribute("data-health")).toBe("unhealthy");
    advance(20);
    expect(getNode("nested1").getAttribute("data-health")).toBe("healthy");
    expect(getNode("dep1").getAttribute("data-health")).toBe("unhealthy");

    advance(t.firstRecoveryStart - t.leafRecoveredAt + 360);
    expect(getRecoveryProgress("nested1-dep1")).toBeGreaterThan(0);
    expect(getRecoveryProgress("nested1-dep1")).toBeLessThan(100);
    expect(
      first.querySelector(".signal-flow-help-propagation.is-recovery"),
    ).not.toBeNull();
    expect(getNode("dep1").getAttribute("data-health")).toBe("unhealthy");

    advance(t.dependencyRecoveredAt - t.firstRecoveryStart - 360 - 20);
    expect(getNode("dep1").getAttribute("data-health")).toBe("unhealthy");
    advance(20);
    expect(getNode("dep1").getAttribute("data-health")).toBe("healthy");
    expect(getNode("item").getAttribute("data-health")).toBe("unhealthy");
    expect(first.querySelector(".signal-flow-help-current.is-red")).toBeNull();

    advance(t.secondRecoveryStart - t.dependencyRecoveredAt + 400);
    expect(getRecoveryProgress("dep1-item")).toBeGreaterThan(0);
    expect(getRecoveryProgress("dep1-item")).toBeLessThan(100);
    expect(getNode("item").getAttribute("data-health")).toBe("unhealthy");

    advance(t.itemRecoveredAt - t.secondRecoveryStart - 400);
    expect(getNode("item").getAttribute("data-health")).toBe("healthy");
    expect(second.querySelector(".signal-flow-help-propagation")).toBeNull();
    expect(second.querySelector(".signal-flow-help-current.is-red")).toBeNull();
    expect(document.querySelectorAll('[data-health="unhealthy"]')).toHaveLength(
      0,
    );

    advance(unhealthyCycleDuration - actualTime(t.itemRecoveredAt));
    expect(
      screen
        .getByRole("progressbar", { name: "Animation progress" })
        .getAttribute("aria-valuenow"),
    ).toBe("0");
    advance(t.failureStart);
    expect(getNode("nested1").getAttribute("data-health")).toBe("unhealthy");
    expect(getNode("dep1").getAttribute("data-health")).toBe("healthy");
  });
});
