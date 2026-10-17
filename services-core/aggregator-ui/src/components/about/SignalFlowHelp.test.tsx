/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HealthySignalsHelpDemo from "./healthy-signals/HealthySignalsHelpDemo";
import UnhealthySignalsHelpDemo from "./unhealthy-signals/UnhealthySignalsHelpDemo";

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
    ["unhealthy", 27300],
  ] as const)("preserves the %s cycle and progress reset", (mode, duration) => {
    render(
      mode === "healthy" ? (
        <HealthySignalsHelpDemo />
      ) : (
        <UnhealthySignalsHelpDemo />
      ),
    );
    const bar = screen.getByRole("progressbar", { name: "Animation progress" });
    const midpoint = Math.floor(duration / 200) * 100;
    advance(midpoint);
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
    advance(duration - midpoint);
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    advance(300);
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  });

  it.each([
    ["healthy", 6500, '[data-selection-frame="availability"]'],
    ["unhealthy", 13800, '[data-unhealthy-frame="item"]'],
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
      advance(1000);
      expect(page.style.opacity).toBe("1");
      expect(frame.getAttribute("opacity")).toBe("1");
      expect(Number(progress.getAttribute("aria-valuenow"))).toBeGreaterThan(
        before,
      );
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
    for (const time of [11200, 13800, 15800, 17800]) {
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
    advance(11200);
    expect(Number(page.style.opacity)).toBeGreaterThan(0);
    expect(Number(page.style.opacity)).toBeLessThan(1);
    expect(box.getAttribute("x")).not.toBe(startX);
    advance(2600);
    expect(page.style.opacity).toBe("1");
    expect(box.getAttribute("opacity")).toBe("0");
    expect(page.querySelectorAll(".item-navigation-link")).toHaveLength(2);
    expect(page.querySelectorAll(".signal-name")).toHaveLength(2);
    expect(page.querySelector(".content-status-label")?.textContent).toBe(
      "DOWN",
    );
    advance(7200);
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

  it("propagates red 2.5x faster without changing when dependent nodes fail", () => {
    render(<UnhealthySignalsHelpDemo />);

    expect(getNode("nested1").getAttribute("data-health")).toBe("healthy");
    expect(getNode("dep1").getAttribute("data-health")).toBe("healthy");
    expect(getNode("item").getAttribute("data-health")).toBe("healthy");

    advance(1600);
    expect(getNode("nested1").getAttribute("data-health")).toBe("unhealthy");
    expect(document.querySelectorAll("[data-failing-check]")).toHaveLength(1);
    expect(getNode("dep1").getAttribute("data-health")).toBe("healthy");

    // The first red wave still starts at 2400 ms, but now takes 720 ms.
    advance(800);
    expect(getProgress("nested1-dep1")).toBe(0);
    advance(400);
    expect(getProgress("nested1-dep1")).toBeGreaterThan(0);
    expect(getProgress("nested1-dep1")).toBeLessThan(100);
    expect(
      document.querySelector(
        '[data-flow-edge="nested1-dep1"] .signal-flow-help-current',
      ),
    ).toBeNull();

    advance(400);
    expect(getProgress("nested1-dep1")).toBe(100);
    expect(getNode("dep1").getAttribute("data-health")).toBe("healthy");
    advance(1100);
    expect(getNode("dep1").getAttribute("data-health")).toBe("healthy");
    advance(100);
    expect(getNode("dep1").getAttribute("data-health")).toBe("unhealthy");
    expect(getNode("dep2").getAttribute("data-health")).toBe("healthy");

    // The second wave still starts at 4900 ms, but now takes 800 ms.
    advance(500);
    expect(getProgress("dep1-item")).toBe(0);
    expect(getNode("item").getAttribute("data-health")).toBe("healthy");
    advance(400);
    expect(getProgress("dep1-item")).toBeGreaterThan(0);
    expect(getProgress("dep1-item")).toBeLessThan(100);
    advance(400);
    expect(getProgress("dep1-item")).toBe(100);
    expect(getNode("item").getAttribute("data-health")).toBe("healthy");
    advance(1300);
    expect(getNode("item").getAttribute("data-health")).toBe("healthy");
    advance(100);
    expect(getNode("item").getAttribute("data-health")).toBe("unhealthy");
    expect(getNode("nested2").getAttribute("data-health")).toBe("healthy");
    expect(getNode("nested3").getAttribute("data-health")).toBe("healthy");
    expect(document.querySelector("figcaption")).toBeNull();
    expect(getNode("item").textContent).toContain("client-service");
    expect(getNode("dep2").textContent).toContain("client-backend");
  });

  it("restores the leaf, then the parent, then the Item with bottom-up green waves", () => {
    render(<UnhealthySignalsHelpDemo />);
    const graph = document.querySelector(
      ".signal-flow-help-graph",
    ) as SVGGElement;
    const first = document.querySelector(
      '[data-flow-edge="nested1-dep1"]',
    ) as SVGGElement;
    const second = document.querySelector(
      '[data-flow-edge="dep1-item"]',
    ) as SVGGElement;

    advance(21800);
    expect(graph.style.opacity).toBe("1");
    expect(getNode("nested1").getAttribute("data-health")).toBe("unhealthy");
    expect(getNode("dep1").getAttribute("data-health")).toBe("unhealthy");
    expect(getNode("item").getAttribute("data-health")).toBe("unhealthy");

    advance(400);
    expect(getNode("nested1").getAttribute("data-health")).toBe("healthy");
    expect(getNode("dep1").getAttribute("data-health")).toBe("unhealthy");
    expect(getProgress("nested1-dep1")).toBe(100);

    advance(1200);
    expect(getRecoveryProgress("nested1-dep1")).toBeGreaterThan(0);
    expect(getRecoveryProgress("nested1-dep1")).toBeLessThan(100);
    expect(
      first.querySelector(".signal-flow-help-propagation.is-recovery"),
    ).not.toBeNull();
    expect(getNode("dep1").getAttribute("data-health")).toBe("unhealthy");
    expect(getNode("item").getAttribute("data-health")).toBe("unhealthy");

    advance(1100);
    expect(getNode("dep1").getAttribute("data-health")).toBe("healthy");
    expect(getNode("item").getAttribute("data-health")).toBe("unhealthy");
    expect(first.querySelector(".signal-flow-help-propagation")).toBeNull();
    expect(first.querySelector(".signal-flow-help-current.is-red")).toBeNull();

    advance(900);
    expect(getRecoveryProgress("dep1-item")).toBeGreaterThan(0);
    expect(getRecoveryProgress("dep1-item")).toBeLessThan(100);
    expect(getNode("item").getAttribute("data-health")).toBe("unhealthy");

    advance(1500);
    expect(getNode("item").getAttribute("data-health")).toBe("healthy");
    expect(second.querySelector(".signal-flow-help-propagation")).toBeNull();
    expect(second.querySelector(".signal-flow-help-current.is-red")).toBeNull();
    expect(document.querySelectorAll('[data-health="unhealthy"]')).toHaveLength(
      0,
    );

    // All-green recovery ends at 26800 ms (including the page hold).
    // The remaining 500 ms stay green, then the opening pause starts again.
    advance(300);
    expect(document.querySelectorAll('[data-health="unhealthy"]')).toHaveLength(
      0,
    );
    advance(100);
    expect(document.querySelectorAll('[data-health="unhealthy"]')).toHaveLength(
      0,
    );
    advance(100);
    expect(document.querySelectorAll('[data-health="unhealthy"]')).toHaveLength(
      0,
    );
    expect(
      screen
        .getByRole("progressbar", { name: "Animation progress" })
        .getAttribute("aria-valuenow"),
    ).toBe("0");
    advance(1600);
    expect(getNode("nested1").getAttribute("data-health")).toBe("unhealthy");
    expect(getNode("dep1").getAttribute("data-health")).toBe("healthy");
  });
});
