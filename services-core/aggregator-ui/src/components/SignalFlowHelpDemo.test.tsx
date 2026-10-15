/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SignalFlowHelpDemo from "./SignalFlowHelpDemo";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const advance = (milliseconds: number) =>
  act(() => vi.advanceTimersByTime(milliseconds));

const getNode = (id: string) =>
  document.querySelector('[data-flow-node="' + id + '"]') as Element;

const getProgress = (id: string) => {
  const path = document.querySelector(
    '[data-flow-edge="' + id + '"] .signal-flow-help-propagation',
  );
  return path ? Number(path.getAttribute("data-progress")) : 0;
};

describe("Signal flow help demonstrations", () => {
  it("shows the same six connected items with passing checks in Healthy signals", () => {
    render(<SignalFlowHelpDemo mode="healthy" />);

    expect(document.querySelectorAll("[data-flow-node]")).toHaveLength(6);
    expect(document.querySelectorAll("[data-flow-edge]")).toHaveLength(5);
    expect(document.querySelectorAll(".signal-flow-help-checks")).toHaveLength(6);
    expect(document.querySelectorAll("[data-own-signal]")).toHaveLength(3);
    expect(document.querySelector("[data-failing-check]")).toBeNull();
    expect(document.querySelectorAll('[data-health="unhealthy"]')).toHaveLength(0);
    expect(screen.queryByText(/All Items have their own checks/)).toBeNull();
    expect(document.querySelector("figcaption")).toBeNull();
    expect(getNode("item").textContent).toContain("client-service");
    expect(screen.getByText("client-ux")).not.toBeNull();
    expect(screen.getByText("client-backend")).not.toBeNull();
    expect(screen.getByText("frontend-enabler")).not.toBeNull();
    expect(screen.getByText("auth-service")).not.toBeNull();
    expect(screen.getByText("postgres-db")).not.toBeNull();

    advance(9000);
    expect(document.querySelectorAll('[data-health="unhealthy"]')).toHaveLength(0);
  });

  it.each([
    ["healthy", 13000],
    ["unhealthy", 21800],
  ] as const)("tracks the %s animation cycle at the top", (mode, duration) => {
    const { container } = render(<SignalFlowHelpDemo mode={mode} />);
    const progress = screen.getByRole("progressbar", { name: "Animation progress" });
    const fill = container.querySelector(".help-animation-progress-fill") as HTMLElement;

    expect(progress.getAttribute("aria-valuenow")).toBe("0");
    expect(fill.style.transform).toBe("scaleX(0)");

    advance(duration / 2);
    expect(progress.getAttribute("aria-valuenow")).toBe("50");
    expect(fill.style.transform).toBe("scaleX(0.5)");

    advance(duration / 2);
    expect(progress.getAttribute("aria-valuenow")).toBe("0");
    expect(fill.style.transform).toBe("scaleX(0)");
    expect(fill.style.transition).toBe("none");

    advance(100);
    expect(Number(progress.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  });

  it("highlights only the current Item checks and morphs them into the page's links", () => {
    render(<SignalFlowHelpDemo mode="healthy" />);
    const diagram = screen.getByRole("img", {
      name: /Passing checks in six connected services/,
    });
    const selected = Array.from(diagram.querySelectorAll("[data-own-signal]"));
    const frames = Array.from(diagram.querySelectorAll("[data-selection-frame]"));
    const page = diagram.querySelector('[data-healthy-page="true"]') as SVGElement;
    const graph = diagram.querySelector(".signal-flow-help-graph") as SVGElement;

    expect(selected).toHaveLength(3);
    expect(frames).toHaveLength(3);
    expect(page.style.opacity).toBe("0");
    expect(graph.style.opacity).toBe("1");

    advance(2900);
    expect(frames.every((frame) => Number(frame.getAttribute("opacity")) === 1)).toBe(true);
    expect(frames[0].getAttribute("x")).toBe("280");
    expect(page.style.opacity).toBe("0");

    advance(3600);
    expect(page.style.opacity).toBe("1");
    expect(graph.style.opacity).toBe("0");
    expect(frames[0].getAttribute("x")).toBe("132");
    expect(frames[0].getAttribute("width")).toBe("374");
    expect(diagram.querySelectorAll(".signal-flow-help-page-link")).toHaveLength(3);
    const surface = diagram.querySelector(".signal-flow-help-page-surface") as Element;
    expect(surface.getAttribute("x")).toBe("0");
    expect(surface.getAttribute("width")).toBe("640");
    expect(surface.getAttribute("stroke")).toBe("none");
    expect(screen.getByText("Availability").getAttribute("opacity")).toBe("1");
    expect(screen.getByText("Success ratio").getAttribute("opacity")).toBe("1");
    expect(screen.getByText("Latency").getAttribute("opacity")).toBe("1");
    expect(
      diagram.querySelector('[data-healthy-page="true"] .signal-flow-help-page-title')?.textContent,
    ).toBe("client-service");

    advance(100);
    expect(frames.every((frame) => frame.getAttribute("opacity") === "0")).toBe(true);
    advance(1000);
    expect(frames.every((frame) => frame.getAttribute("opacity") === "1")).toBe(true);
    advance(2400);
    expect(page.style.opacity).toBe("0");
    expect(graph.style.opacity).toBe("1");
    expect(frames[0].getAttribute("x")).toBe("280");
    expect(frames[0].getAttribute("width")).toBe("24");
    expect(diagram.querySelectorAll("[data-own-signal]")[0]).toBe(selected[0]);

    advance(3200);
    expect(frames[0].getAttribute("opacity")).toBe("0");
    expect(page.style.opacity).toBe("0");
    expect(graph.style.opacity).toBe("1");
  });

  it("propagates the failed nested dependency toward its parent and current Item", () => {
    render(<SignalFlowHelpDemo mode="unhealthy" />);

    expect(getNode("nested1").getAttribute("data-health")).toBe("healthy");
    expect(getNode("dep1").getAttribute("data-health")).toBe("healthy");
    expect(getNode("item").getAttribute("data-health")).toBe("healthy");

    advance(1600);
    expect(getNode("nested1").getAttribute("data-health")).toBe("unhealthy");
    expect(document.querySelectorAll("[data-failing-check]")).toHaveLength(1);
    expect(getNode("dep1").getAttribute("data-health")).toBe("healthy");
    expect(getProgress("nested1-dep1")).toBe(0);

    advance(1700);
    expect(getProgress("nested1-dep1")).toBeGreaterThan(0);
    expect(getProgress("nested1-dep1")).toBeLessThan(100);
    expect(
      document.querySelector(
        '[data-flow-edge="nested1-dep1"] .signal-flow-help-current',
      ),
    ).toBeNull();
    expect(getNode("dep1").getAttribute("data-health")).toBe("healthy");

    advance(1300);
    expect(getProgress("nested1-dep1")).toBe(100);
    expect(getNode("dep1").getAttribute("data-health")).toBe("unhealthy");
    expect(getNode("dep2").getAttribute("data-health")).toBe("healthy");
    expect(getNode("item").getAttribute("data-health")).toBe("healthy");

    advance(1300);
    expect(getProgress("dep1-item")).toBeGreaterThan(0);
    expect(getNode("item").getAttribute("data-health")).toBe("healthy");

    advance(1500);
    expect(getProgress("dep1-item")).toBe(100);
    expect(getNode("item").getAttribute("data-health")).toBe("unhealthy");
    expect(getNode("nested2").getAttribute("data-health")).toBe("healthy");
    expect(getNode("nested3").getAttribute("data-health")).toBe("healthy");
    expect(document.querySelector("figcaption")).toBeNull();
    expect(getNode("item").textContent).toContain("client-service");
    expect(getNode("dep2").textContent).toContain("client-backend");
  });

  it("morphs two full dependency nodes, each with one signal, into the unhealthy list and back", () => {
    render(<SignalFlowHelpDemo mode="unhealthy" />);
    const diagram = screen.getByRole("img", {
      name: /A failing check in frontend-enabler/,
    });
    const page = diagram.querySelector('[data-unhealthy-page="true"]') as SVGElement;
    const graph = diagram.querySelector(".signal-flow-help-graph") as SVGElement;
    const groups = Array.from(
      diagram.querySelectorAll(".signal-flow-help-moving-dependency"),
    );
    const item = diagram.querySelector('[data-unhealthy-source="item"]') as Element;
    const itemFrame = item.querySelector('[data-unhealthy-frame="item"]') as Element;
    const itemBox = item.querySelector('[data-moving-item-box="true"]') as Element;
    const itemTitle = item.querySelector('[data-moving-item-title="true"]') as Element;
    const itemStatus = item.querySelector('[data-moving-item-status="true"]') as Element;
    const parent = diagram.querySelector('[data-unhealthy-source="dep1"]') as Element;
    const nested = diagram.querySelector('[data-unhealthy-source="nested1"]') as Element;
    const parentFrame = parent.querySelector('[data-unhealthy-frame="dep1"]') as Element;
    const nestedFrame = nested.querySelector('[data-unhealthy-frame="nested1"]') as Element;
    const parentBox = parent.querySelector(".signal-flow-help-node-frame") as Element;
    const nestedBox = nested.querySelector(".signal-flow-help-node-frame") as Element;

    expect(groups).toHaveLength(3);
    expect(item.textContent).toContain("client-service");
    expect(parent.textContent).toContain("client-ux");
    expect(nested.textContent).toContain("frontend-enabler");
    expect(diagram.querySelectorAll("[data-flow-node]")).toHaveLength(6);
    expect(page.style.opacity).toBe("0");
    expect(graph.style.opacity).toBe("1");
    expect(parentBox.getAttribute("x")).toBe("115");
    expect(nestedBox.getAttribute("x")).toBe("19");
    expect(itemBox.getAttribute("x")).toBe("244");
    expect(itemTitle.getAttribute("x")).toBe("274");
    expect(item.getAttribute("data-health")).toBe("healthy");

    advance(9400);
    expect(parent.getAttribute("data-health")).toBe("unhealthy");
    expect(nested.getAttribute("data-health")).toBe("unhealthy");
    expect(item.getAttribute("data-health")).toBe("unhealthy");
    expect(itemFrame.getAttribute("opacity")).toBe("1");
    expect(parentFrame.getAttribute("opacity")).toBe("1");
    expect(nestedFrame.getAttribute("opacity")).toBe("1");
    expect(page.style.opacity).toBe("0");
    expect(diagram.querySelectorAll(".signal-flow-help-moving-dependency .signal-flow-help-page-link")).toHaveLength(2);

    advance(1800);
    expect(Number(itemBox.getAttribute("width"))).toBeGreaterThan(152);
    expect(Number(itemBox.getAttribute("width"))).toBeLessThan(389);
    expect(Number(itemTitle.getAttribute("x"))).toBeLessThan(274);
    expect(itemFrame.getAttribute("opacity")).toBe("1");
    expect(Number(parentBox.getAttribute("width"))).toBeGreaterThan(154);
    expect(Number(parentBox.getAttribute("width"))).toBeLessThan(388);
    expect(Number(page.style.opacity)).toBeGreaterThan(0);
    expect(Number(page.style.opacity)).toBeLessThan(1);
    expect(Number(graph.style.opacity)).toBeGreaterThan(0);
    expect(Number(graph.style.opacity)).toBeLessThan(1);
    expect(parentFrame.getAttribute("opacity")).toBe("1");
    expect(nestedFrame.getAttribute("opacity")).toBe("1");

    advance(2200);
    expect(page.style.opacity).toBe("1");
    expect(graph.style.opacity).toBe("0");
    const surface = diagram.querySelector(".signal-flow-help-page-surface") as Element;
    expect(surface.getAttribute("x")).toBe("0");
    expect(surface.getAttribute("width")).toBe("640");
    expect(surface.getAttribute("stroke")).toBe("none");
    expect(itemBox.getAttribute("x")).toBe("113");
    expect(itemBox.getAttribute("width")).toBe("389");
    expect(itemTitle.getAttribute("x")).toBe("150");
    expect(itemTitle.getAttribute("y")).toBe("51");
    expect(itemStatus.getAttribute("opacity")).toBe("1");
    expect(page.querySelector(".signal-flow-help-page-title")).toBeNull();
    expect(parentBox.getAttribute("x")).toBe("126");
    expect(parentBox.getAttribute("width")).toBe("388");
    expect(nestedBox.getAttribute("x")).toBe("126");
    expect(nestedBox.getAttribute("y")).toBe("232");
    expect(screen.getByText("Error rate").getAttribute("opacity")).toBe("1");
    expect(screen.getByText("Readiness check").getAttribute("opacity")).toBe("1");
    expect(Number(parentFrame.getAttribute("opacity"))).toBeLessThan(1);
    expect(Number(parentFrame.getAttribute("opacity"))).toBeGreaterThan(0);
    expect(Number(nestedFrame.getAttribute("opacity"))).toBeLessThan(1);
    expect(diagram.querySelectorAll(".signal-flow-help-moving-dependency .signal-flow-help-page-link")).toHaveLength(2);

    advance(600);
    expect(itemFrame.getAttribute("opacity")).toBe("0");
    expect(itemBox.getAttribute("opacity")).toBe("0");
    expect(itemTitle.textContent).toBe("client-service");
    expect(itemStatus.getAttribute("opacity")).toBe("1");
    expect(parentFrame.getAttribute("opacity")).toBe("0");
    expect(nestedFrame.getAttribute("opacity")).toBe("0");
    expect(parentBox.getAttribute("opacity")).toBe("0");
    advance(1400);
    expect(itemFrame.getAttribute("opacity")).toBe("1");
    expect(parentFrame.getAttribute("opacity")).toBe("1");
    expect(nestedFrame.getAttribute("opacity")).toBe("1");
    advance(1200);
    expect(Number(page.style.opacity)).toBeGreaterThan(0);
    expect(Number(page.style.opacity)).toBeLessThan(1);
    expect(parentFrame.getAttribute("opacity")).toBe("1");
    expect(nestedFrame.getAttribute("opacity")).toBe("1");

    advance(2400);
    expect(page.style.opacity).toBe("0");
    expect(graph.style.opacity).toBe("1");
    expect(itemBox.getAttribute("x")).toBe("244");
    expect(itemBox.getAttribute("width")).toBe("152");
    expect(itemTitle.getAttribute("x")).toBe("274");
    expect(parentBox.getAttribute("x")).toBe("115");
    expect(parentBox.getAttribute("width")).toBe("154");
    expect(nestedBox.getAttribute("x")).toBe("19");
    expect(groups.every((group) => group.isConnected)).toBe(true);

    advance(1800);
    expect(itemFrame.getAttribute("opacity")).toBe("0");
    expect(parentFrame.getAttribute("opacity")).toBe("0");
    expect(nestedFrame.getAttribute("opacity")).toBe("0");
    expect(item.getAttribute("data-health")).toBe("healthy");
    expect(parent.getAttribute("data-health")).toBe("healthy");
    expect(nested.getAttribute("data-health")).toBe("healthy");
  });

  it.each(["healthy", "unhealthy"] as const)(
    "fills the card with the %s list on narrow containers",
    (mode) => {
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
        () => ({ width: 420, height: 420, toJSON: () => ({}) }) as DOMRect,
      );
      const { container } = render(<SignalFlowHelpDemo mode={mode} />);
      const diagram = container.querySelector(".signal-flow-help-diagram") as SVGElement;
      expect(diagram.getAttribute("data-page-layout")).toBe("compact");
      const page = diagram.querySelector(".signal-flow-help-page") as SVGElement;
      expect(page.querySelector('g[transform="translate(-90 0)"]')).not.toBeNull();
      advance(mode === "healthy" ? 6500 : 14000);
      if (mode === "healthy") {
        const frame = diagram.querySelector('[data-selection-frame="availability"]') as Element;
        expect(frame.getAttribute("x")).toBe("42");
        expect(frame.getAttribute("width")).toBe("570");
      } else {
        const frame = diagram.querySelector('[data-unhealthy-source="dep1"] .signal-flow-help-node-frame') as Element;
        const itemBox = diagram.querySelector('[data-moving-item-box="true"]') as Element;
        const itemTitle = diagram.querySelector('[data-moving-item-title="true"]') as Element;
        expect(frame.getAttribute("x")).toBe("33");
        expect(frame.getAttribute("width")).toBe("575");
        expect(itemBox.getAttribute("x")).toBe("21");
        expect(itemTitle.getAttribute("x")).toBe("60");
      }
    },
  );

  it("resets and replays after the unhealthy state is shown", () => {
    render(<SignalFlowHelpDemo mode="unhealthy" />);
    advance(20200);

    expect(getNode("nested1").getAttribute("data-health")).toBe("healthy");
    expect(getNode("item").getAttribute("data-health")).toBe("healthy");
    advance(3400);
    expect(getNode("nested1").getAttribute("data-health")).toBe("unhealthy");
  });
});
