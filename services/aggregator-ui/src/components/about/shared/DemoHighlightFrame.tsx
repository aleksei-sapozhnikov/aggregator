/** @file Provides matching selection highlights for SVG illustrations and HTML Item previews. */

import type { CSSProperties } from "react";
import "./DemoHighlightFrame.css";

type DemoHighlightFrameProps = {
  mode?: "svg" | "html";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity?: number;
  "data-selection-frame"?: string;
  "data-healthy-frame"?: string;
  "data-unhealthy-frame"?: string;
  "data-primary-contact-highlight"?: string;
  "data-timeline-dependency-highlight"?: string;
};

export default function DemoHighlightFrame({
  mode = "svg",
  x,
  y,
  width,
  height,
  color,
  opacity = 1,
  ...dataAttributes
}: DemoHighlightFrameProps) {
  const colorStyle = { "--demo-highlight-color": color } as CSSProperties;

  if (mode === "html") {
    return (
      <span
        {...dataAttributes}
        className="demo-highlight-frame demo-highlight-frame--html"
        aria-hidden="true"
        style={{
          ...colorStyle,
          left: x,
          top: y,
          width,
          height,
          opacity,
        }}
      />
    );
  }

  return (
    <rect
      {...dataAttributes}
      className="demo-highlight-frame"
      x={x}
      y={y}
      width={width}
      height={height}
      rx={7}
      opacity={opacity}
      style={colorStyle}
    />
  );
}
