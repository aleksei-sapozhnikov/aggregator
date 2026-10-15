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
    expect(document.querySelector("[data-failing-check]")).toBeNull();
    expect(document.querySelectorAll('[data-health="unhealthy"]')).toHaveLength(0);
    expect(screen.getByText(/Each Item has its own passing checks/)).not.toBeNull();

    advance(9000);
    expect(document.querySelectorAll('[data-health="unhealthy"]')).toHaveLength(0);
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
