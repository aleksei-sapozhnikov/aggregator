import type { ReactNode } from "react";
import DetailsDisclosureHeader from "./DetailsDisclosureHeader";

/** Shared Timeline disclosure; its visualization is supplied by the caller. */
export default function ItemTimeline({
  expanded,
  onToggle,
  help,
  height,
  children,
}: {
  expanded: boolean;
  onToggle?: () => void;
  help?: ReactNode;
  height?: number;
  children?: ReactNode;
}) {
  return (
    <section className="details-disclosure-section details-timeline-section">
      <DetailsDisclosureHeader
        label="Timeline"
        toggleLabel="Toggle Timeline"
        expanded={expanded}
        onToggle={onToggle}
        help={help}
        icon={
          <span
            className="details-disclosure-icon details-disclosure-symbol"
            aria-hidden="true"
          >
            ◷
          </span>
        }
      />
      {expanded && (
        <div className="details-timeline-body">
          <div className="grafana-grid">
            <section
              className="grafana-panel"
              style={height ? { height: `${height}px` } : undefined}
            >
              {children}
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
