/** @vitest-environment jsdom */
import { useRef } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import HelpScene, { useHelpTargets } from "./HelpScene";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps HTML and SVG in the same coordinate system after a container resize", () => {
  let width = 320;
  let resize: (() => void) | undefined;
  const disconnect = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width }) as DOMRect,
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const onResize = vi.fn();
  const { container, unmount } = render(
    <HelpScene width={640} height={340} onResize={onResize}>
      <svg viewBox="0 0 640 340" />
      <div>HTML page</div>
    </HelpScene>,
  );
  const canvas = container.querySelector(".help-scene-canvas") as HTMLElement;
  expect(canvas.style.transform).toBe("scale(0.5) translate(0px, 0px)");
  expect(canvas.querySelector("svg")?.parentElement).toBe(
    screen.getByText("HTML page").parentElement,
  );
  width = 480;
  act(() => resize?.());
  expect(canvas.style.transform).toBe("scale(0.75) translate(0px, 0px)");
  expect(onResize).toHaveBeenLastCalledWith(480);
  unmount();
  expect(disconnect).toHaveBeenCalledTimes(1);
});

const selectors = { row: ".target-row" };
const fallback = { row: { x: 0, y: 0, width: 0, height: 0 } };
function TargetExample() {
  const ref = useRef<HTMLDivElement>(null);
  const targets = useHelpTargets(ref, selectors, fallback);
  return (
    <div ref={ref} className="target-page">
      <div className="target-row" />
      <output>{JSON.stringify(targets.row)}</output>
    </div>
  );
}

it("moves animation destinations when shared row geometry changes, accounting for CSS scale", () => {
  let rowTop = 140;
  let measure: (() => void) | undefined;
  const observed: Element[] = [];
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return (
        this.classList.contains("target-page")
          ? { left: 50, top: 100, width: 500, height: 400 }
          : { left: 150, top: rowTop, width: 120, height: 20 }
      ) as DOMRect;
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe(element: Element) {
        observed.push(element);
      }
      disconnect() {}
    },
  );
  render(<TargetExample />);
  expect(screen.getByRole("status").textContent).toBe(
    JSON.stringify({ x: 200, y: 80, width: 240, height: 40 }),
  );
  expect(
    observed.some((element) => element.classList.contains("target-row")),
  ).toBe(true);
  rowTop = 165;
  act(() => measure?.());
  expect(screen.getByRole("status").textContent).toBe(
    JSON.stringify({ x: 200, y: 130, width: 240, height: 40 }),
  );
});
