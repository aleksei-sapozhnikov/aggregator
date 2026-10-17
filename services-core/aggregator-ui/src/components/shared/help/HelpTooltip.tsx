/** @file Positions accessible help text beside a trigger within viewport bounds. */

import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";

const gap = 6;
const padding = 8;

export default function HelpTooltip({
  id,
  anchorRef,
  visible,
  content,
  action,
}: {
  id: string;
  anchorRef: RefObject<HTMLElement | null>;
  visible: boolean;
  content: ReactNode;
  action?: ReactNode;
}) {
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!visible) return undefined;
    const update = () => {
      if (!anchorRef.current || !tipRef.current) return;
      const anchor = anchorRef.current.getBoundingClientRect();
      const tip = tipRef.current.getBoundingClientRect();
      const above = anchor.top - gap - padding;
      const below = window.innerHeight - anchor.bottom - gap - padding;
      const useBelow = tip.height > above && below > above;
      const y = useBelow ? anchor.bottom + gap : anchor.top - tip.height - gap;
      const x = anchor.left + anchor.width / 2 - tip.width / 2;
      const next = {
        left: Math.max(
          padding,
          Math.min(x, window.innerWidth - tip.width - padding),
        ),
        top: Math.max(
          padding,
          Math.min(y, window.innerHeight - tip.height - padding),
        ),
      };
      setPosition((current) =>
        current?.left === next.left && current.top === next.top
          ? current
          : next,
      );
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, visible, content, action]);

  if (!visible) return null;
  return createPortal(
    <span
      ref={tipRef}
      id={id}
      role="tooltip"
      className="info-help-tooltip"
      style={{
        left: (position?.left ?? 0) + "px",
        top: (position?.top ?? 0) + "px",
        transform: "none",
        visibility: position ? "visible" : "hidden",
      }}
    >
      <span>{content}</span>
      {action && <span className="help-tooltip-action">{action}</span>}
    </span>,
    document.body,
  );
}
