import { useRef } from "react";
import type { PointerEvent, ReactNode } from "react";

type PointerState = {
  startX: number;
  startY: number;
  startSelection: string;
  dragged: boolean;
  suppressClick: boolean;
};

const selectedText = () => window.getSelection?.()?.toString() || "";

/** Selection and dragging must not accidentally toggle a disclosure. */
export default function DetailsDisclosureHeader({
  label, toggleLabel, expanded, onToggle, icon, help,
}: {
  label: string;
  toggleLabel: string;
  expanded: boolean;
  onToggle?: () => void;
  icon: ReactNode;
  help?: ReactNode;
}) {
  const pointer = useRef<PointerState | null>(null);
  const trackDrag = (event: PointerEvent<HTMLElement>) => {
    if (pointer.current && Math.hypot(
      event.clientX - pointer.current.startX,
      event.clientY - pointer.current.startY,
    ) > 5) pointer.current.dragged = true;
  };
  return (
    <div className="details-disclosure-header">
      <span role="button" tabIndex={onToggle ? 0 : -1}
        className="details-disclosure-toggle" aria-label={toggleLabel}
        aria-expanded={expanded} aria-disabled={onToggle ? undefined : true}
        onPointerDown={onToggle ? (event) => {
          pointer.current = {
            startX: event.clientX, startY: event.clientY,
            startSelection: selectedText(), dragged: false, suppressClick: false,
          };
        } : undefined}
        onPointerMove={onToggle ? trackDrag : undefined}
        onPointerUp={onToggle ? (event) => {
          trackDrag(event);
          if (pointer.current) pointer.current.suppressClick =
            pointer.current.dragged || selectedText() !== pointer.current.startSelection;
        } : undefined}
        onClick={onToggle ? () => {
          const suppress = pointer.current?.suppressClick;
          pointer.current = null;
          if (!suppress) onToggle();
        } : undefined}
        onKeyDown={onToggle ? (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        } : undefined}
      >
        <span className={`details-panel-chevron ${expanded ? "is-open" : ""}`} aria-hidden="true">›</span>
        {icon}
        <span className="details-disclosure-label">{label}</span>
      </span>
      {help}
    </div>
  );
}
