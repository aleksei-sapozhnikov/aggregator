import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import "./HelpScene.css";

export type SceneRect = { x: number; y: number; width: number; height: number };

/** Scale ordinary HTML and illustrative SVG together, without SVG foreignObject. */
export default function HelpScene({
  width,
  height,
  viewBox,
  onResize,
  children,
}: {
  width: number;
  height: number;
  viewBox?: string;
  onResize?: (width: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(width);
  const [left, top, viewportWidth, viewportHeight] = viewBox
    ? viewBox.split(" ").map(Number)
    : [0, 0, width, height];

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const measured = element.getBoundingClientRect().width;
      if (measured > 0) {
        setAvailableWidth(measured);
        onResize?.(measured);
      }
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [onResize]);

  return (
    <div
      ref={ref}
      className="help-scene"
      style={{ aspectRatio: `${viewportWidth} / ${viewportHeight}` }}
    >
      <div
        className="help-scene-canvas"
        style={{
          width,
          height,
          transform: `scale(${availableWidth / viewportWidth}) translate(${-left}px, ${-top}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Follow the actual DOM rows when production markup or typography changes. */
export function useHelpTargets<T extends string>(
  pageRef: RefObject<HTMLDivElement | null>,
  selectors: Record<T, string>,
  fallback: Record<T, SceneRect>,
): Record<T, SceneRect> {
  const [targets, setTargets] = useState(fallback);
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const measure = () => {
      const pageRect = page.getBoundingClientRect();
      const scale = pageRect.width / page.offsetWidth;
      if (!Number.isFinite(scale) || scale <= 0) return;
      const next = { ...fallback };
      for (const key of Object.keys(selectors) as T[]) {
        const element = page.querySelector(selectors[key]);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        next[key] = {
          x: (rect.left - pageRect.left) / scale,
          y: (rect.top - pageRect.top) / scale,
          width: rect.width / scale,
          height: rect.height / scale,
        };
      }
      setTargets((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    for (const selector of Object.values(selectors) as string[]) {
      const element = page.querySelector(selector);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [pageRef, selectors, fallback]);
  return targets;
}
