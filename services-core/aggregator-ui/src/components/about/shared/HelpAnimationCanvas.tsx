/** @file Provides a responsive frame for contextual-help animations. */

import type { CSSProperties, ReactNode } from "react";
import "./HelpAnimationCanvas.css";

/** Responsive, centered frame sized to each help animation's scene. */
export default function HelpAnimationCanvas({
  ariaLabel,
  className = "",
  maxWidth,
  children,
}: {
  ariaLabel: string;
  className?: string;
  maxWidth: number;
  children: ReactNode;
}) {
  return (
    <figure
      className={`help-animation-canvas ${className}`.trim()}
      aria-label={ariaLabel}
      style={
        {
          "--help-animation-max-width": `${maxWidth}px`,
        } as CSSProperties
      }
    >
      {children}
    </figure>
  );
}
