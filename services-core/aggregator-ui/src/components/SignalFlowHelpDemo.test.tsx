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
    expect(screen.getByText(/All Items have their own checks/)).not.toBeNull();

    advance(9000);
    expect(document.querySelectorAll('[data-health="unhealthy"]')).toHaveLength(0);
  });

  it("highlights only the current Item checks and morphs them into the page's links", () => {
    render(<SignalFlowHelpDemo mode="healthy" />);
    const diagram = screen.getByRole("img", {
      name: /Passing checks in six connected items/,
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
    expect(screen.getByText("Availability").getAttribute("opacity")).toBe("1");
    expect(screen.getByText("Success ratio").getAttribute("opacity")).toBe("1");
    expect(screen.getByText("Latency").getAttribute("opacity")).toBe("1");

    advance(3500);
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
    expect(screen.getByText(/current Item is unhealthy/)).not.toBeNull();
  });

  it("resets and replays after the unhealthy state is shown", () => {
    render(<SignalFlowHelpDemo mode="unhealthy" />);
    advance(10200);

    expect(getNode("nested1").getAttribute("data-health")).toBe("healthy");
    expect(getNode("item").getAttribute("data-health")).toBe("healthy");
    advance(2700);
    expect(getNode("nested1").getAttribute("data-health")).toBe("unhealthy");
  });
});
