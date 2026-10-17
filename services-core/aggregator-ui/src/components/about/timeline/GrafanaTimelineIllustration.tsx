/**
 * @file Provides an animated Timeline illustration for help scenarios.
 * The live chart and its controls belong to Grafana in a separate document.
 */

import { progressBetween, smooth } from "../shared/signal-flow/progress";
import "./GrafanaTimelineIllustration.css";

export type Scenario = "inspect" | "filter" | "navigate";
type SignalFilter = "all" | "own" | "dependencies";
type HealthState = "UP" | "DOWN" | "UNKNOWN";
type TimelineRow = {
  id: string;
  label: string;
  kind: "overall" | "own" | "dependencies";
  states: HealthState[];
  item?: string;
};

const segmentWidths = [20, 20, 20, 20, 20];

const exampleRows: TimelineRow[] = [
  {
    id: "overall",
    label: "[Overall] Orders Service",
    kind: "overall",
    states: ["UP", "DOWN", "DOWN", "UP", "UP"],
  },
  {
    id: "availability",
    label: "● HTTP availability check",
    kind: "own",
    states: ["UP", "UP", "UP", "UP", "DOWN"],
  },
  {
    id: "success",
    label: "● Request success ratio",
    kind: "own",
    states: ["UP", "DOWN", "UP", "UP", "UP"],
  },
  {
    id: "payment",
    label: "↳ Payment Gateway · readiness check",
    kind: "dependencies",
    item: "Payment Gateway",
    states: ["UP", "UP", "DOWN", "UP", "UP"],
  },
  {
    id: "inventory",
    label: "↳ Inventory API · synchronization check",
    kind: "dependencies",
    item: "Inventory API",
    states: ["UP", "UP", "UNKNOWN", "UP", "UP"],
  },
  {
    id: "notifications",
    label: "↳ Notification Worker · backlog check",
    kind: "dependencies",
    item: "Notification Worker",
    states: ["UP", "DOWN", "UP", "UP", "UP"],
  },
];

const getFilter = (time: number): SignalFilter =>
  time >= 9200
    ? "all"
    : time >= 5400
      ? "dependencies"
      : time >= 1800
        ? "own"
        : "all";

const filterMenuVisits = [
  { opensAt: 950, selectedAt: 1800, optionY: 134 },
  { opensAt: 4550, selectedAt: 5400, optionY: 172 },
  { opensAt: 8350, selectedAt: 9200, optionY: 96 },
] as const;

const isFilterMenuOpen = (time: number): boolean =>
  filterMenuVisits.some(
    ({ opensAt, selectedAt }) => time >= opensAt && time < selectedAt,
  );

const lerp = (start: number, end: number, fraction: number) =>
  start + (end - start) * Math.max(0, Math.min(1, fraction));

const selectorY = 65;

/**
 * Move the same cursor from the selector to each dropdown choice and back.
 * Never snap it to a menu option when the menu opens or closes.
 */
export function getFilterCursorTop(time: number): number {
  for (const { opensAt, selectedAt, optionY } of filterMenuVisits) {
    if (time < opensAt) return selectorY;
    if (time < selectedAt) {
      return lerp(
        selectorY,
        optionY,
        smooth(progressBetween(time, opensAt + 100, selectedAt - 250)),
      );
    }
    if (time < selectedAt + 650) {
      return lerp(
        optionY,
        selectorY,
        smooth(progressBetween(time, selectedAt + 100, selectedAt + 650)),
      );
    }
  }
  return selectorY;
}

// Start and finish each walkthrough in the empty chart header area.
export function getTimelineCursorTravel(scenario: Scenario, time: number) {
  const exit: Record<Scenario, [number, number]> = {
    inspect: [7800, 8380],
    filter: [10800, 11880],
    navigate: [11200, 12880],
  };
  return (
    smooth(progressBetween(time, 0, 850)) *
    (1 - smooth(progressBetween(time, ...exit[scenario])))
  );
}

function positionedChartCursor(left: string, top: string, travel: number) {
  if (travel >= 1) return { left, top };
  return {
    left: lerp(67, Number.parseFloat(left), travel) + "%",
    top: lerp(-98, Number.parseFloat(top), travel) + "px",
  };
}

function positionedSelectorCursor(top: string, travel: number) {
  if (travel >= 1) return { left: "172px", top };
  const percentage = 100 * (1 - travel);
  const offset = 172 * travel - 160 * (1 - travel);
  return {
    left:
      "calc(" +
      percentage +
      "% " +
      (offset < 0 ? "- " : "+ ") +
      Math.abs(offset) +
      "px)",
    top: lerp(14, Number.parseFloat(top), travel) + "px",
  };
}

// In the inspect scenario, the pointer visits every visible signal row.
// Match the 26px track height and 7px gap in GrafanaTimelineIllustration.css.
const inspectCursorStart = 3000;
const inspectRowDuration = 760;
const inspectRowPitch = 33;
export function getInspectCursorRow(time: number): number {
  const lastRow = exampleRows.length - 1;
  const progress = Math.max(
    0,
    Math.min(lastRow, (time - inspectCursorStart) / inspectRowDuration),
  );
  const row = Math.min(lastRow - 1, Math.floor(progress));
  const movement = Math.min(1, (progress - row) / 0.66);
  const eased = smooth(movement);
  return row + eased;
}

function TimelineStatusMarker({ state }: { state: HealthState }) {
  return (
    <span
      className={"timeline-help-popup-marker is-" + state.toLowerCase()}
      aria-hidden="true"
    />
  );
}

const timelineStart = Date.UTC(2026, 9, 9, 0, 0, 0);
const timelineWeekMs = 7 * 24 * 60 * 60 * 1000;
function timestampAt(position: number): string {
  const date = new Date(
    timelineStart + Math.round((position / 100) * timelineWeekMs),
  );
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    date.getUTCFullYear() +
    "-" +
    pad(date.getUTCMonth() + 1) +
    "-" +
    pad(date.getUTCDate()) +
    " " +
    pad(date.getUTCHours()) +
    ":" +
    pad(date.getUTCMinutes()) +
    ":" +
    pad(date.getUTCSeconds())
  );
}

function TimelineHoverPopup({
  x,
  inspectedRowId,
}: {
  x: number;
  inspectedRowId?: string;
}) {
  return (
    <div
      className={
        "timeline-help-popup timeline-help-popup-hover" +
        (x >= 34 ? " is-flipped" : "")
      }
      style={{ left: x + "%" }}
      aria-label="States at selected time"
    >
      <div className="timeline-help-popup-date">{timestampAt(x)}</div>
      <div className="timeline-help-popup-rows">
        {exampleRows.map((row) => {
          const state =
            row.states[Math.min(row.states.length - 1, Math.floor(x / 20))];
          return (
            <div
              key={row.id}
              className={
                "timeline-help-popup-row" +
                (row.id === inspectedRowId ? " is-inspected" : "")
              }
              data-inspected={row.id === inspectedRowId ? "true" : undefined}
            >
              <span className="timeline-help-popup-name">
                <TimelineStatusMarker state={state} />
                <span>{row.label}</span>
              </span>
              <strong>{state}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineDependencyPopup({
  x,
  linkPressed,
  inspected,
}: {
  x: number;
  linkPressed: boolean;
  inspected: boolean;
}) {
  return (
    <div
      className={
        "timeline-help-popup timeline-help-popup-dependency" +
        (x >= 34 ? " is-flipped" : "")
      }
      style={{ left: x + "%" }}
      aria-label="Dependency signal details"
    >
      <div className="timeline-help-popup-date">
        2026-10-11 19:12:00 – 2026-10-13 04:48:00
      </div>
      <div
        className={
          "timeline-help-popup-row" + (inspected ? " is-inspected" : "")
        }
        data-inspected={inspected ? "true" : undefined}
      >
        <span className="timeline-help-popup-name">
          <TimelineStatusMarker state="DOWN" />
          <span>↳ Payment Gateway · readiness check</span>
        </span>
        <strong>DOWN</strong>
      </div>
      <div className="timeline-help-popup-duration">
        <span>Duration</span>
        <strong>1d 9h 36m</strong>
      </div>
      <div
        className={
          "timeline-help-popup-link" + (linkPressed ? " is-selected" : "")
        }
      >
        <span aria-hidden="true">↗</span>
        Item: Payment Gateway
      </div>
    </div>
  );
}

function TimelineSignalSelect({
  filter,
  menuOpen,
  target,
}: {
  filter: SignalFilter;
  menuOpen: boolean;
  target: SignalFilter | null;
}) {
  const entries: { id: SignalFilter; name: string }[] = [
    { id: "all", name: "● ↳ All" },
    { id: "own", name: "● Own" },
    { id: "dependencies", name: "↳ Dependencies" },
  ];
  return (
    <div
      className="timeline-help-toolbar-demo"
      aria-label="Signal filter demonstration"
    >
      <span className="timeline-help-toolbar-caption">Signals</span>
      <span className="timeline-help-selector">
        <span
          className={
            "timeline-help-selector-value" + (menuOpen ? " is-open" : "")
          }
        >
          {entries.find((entry) => entry.id === filter)?.name}
          <span aria-hidden="true">⌄</span>
        </span>
        {menuOpen && (
          <span
            className="timeline-help-options"
            aria-label="Available signal groups"
          >
            {entries.map((entry) => (
              <span
                key={entry.id}
                className={[
                  "timeline-help-option",
                  filter === entry.id ? "is-selected" : "",
                  target === entry.id ? "is-targeted" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {entry.name}
              </span>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

function ExampleCursor({
  left,
  top,
  pressed = false,
  movingToLink = false,
}: {
  left: string;
  top: string;
  pressed?: boolean;
  movingToLink?: boolean;
}) {
  return (
    <svg
      className={[
        "timeline-help-cursor",
        pressed ? "is-pressed" : "",
        movingToLink ? "is-moving-to-link" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ left, top }}
      viewBox="0 0 24 28"
      focusable="false"
      aria-hidden="true"
    >
      <path
        d="M2 2v21l5.7-5.3 3.5 8 4-1.9-3.8-7.9H20L2 2Z"
        fill="#ffffff"
        stroke="#151515"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function GrafanaTimelineIllustration({
  scenario,
  elapsed,
}: {
  scenario: Scenario;
  elapsed: number;
}) {
  const filter = scenario === "filter" ? getFilter(elapsed) : "all";
  const menuOpen = scenario === "filter" && isFilterMenuOpen(elapsed);
  const visibleRows = exampleRows.filter(
    (row) => row.kind === "overall" || filter === "all" || row.kind === filter,
  );

  // The playhead is a percentage of the actual bars, shared by the line,
  // cursor, hover popup and state lookup. No independent CSS animation drives it.
  // Stop within a segment showing healthy, unhealthy and unknown signals together.
  const endX = scenario === "inspect" ? 50 : 48;
  const x = lerp(20, endX, smooth(progressBetween(elapsed, 600, 2800)));
  const inspectCursorRow = getInspectCursorRow(elapsed);
  const cursorTravel = getTimelineCursorTravel(scenario, elapsed);
  const inspectPopup =
    scenario === "inspect" && elapsed >= 1100 && elapsed < 7800;
  const navigateHover =
    scenario === "navigate" && elapsed >= 1100 && elapsed < 3400;
  const navigateDetails =
    scenario === "navigate" && elapsed >= 3400 && elapsed < 7300;
  const linkPressed =
    scenario === "navigate" && elapsed >= 6400 && elapsed < 7300;
  const movingToLink = navigateDetails && elapsed >= 5100;
  // In the navigation demo, the cursor rests on Payment Gateway's graph
  // before moving to its Item link. Highlight only the row it points at.
  const inspectingPayment = scenario === "navigate" && !movingToLink;
  const inspectedRowId =
    scenario === "inspect"
      ? exampleRows[Math.round(inspectCursorRow)].id
      : inspectingPayment
        ? "payment"
        : undefined;

  // The dependency popup opens beside the chart cursor. Keep the same cursor
  // in the tracks while the popup opens, then animate it toward the Item link
  // without changing its positioning context.
  const navigationCursorLeft = movingToLink
    ? `calc(${x}% - var(--timeline-help-dependency-popup-width) + 66px)`
    : x + "%";
  const navigationCursorTop = movingToLink
    ? "var(--timeline-help-link-cursor-top)"
    : "107px";

  const trackPointer = positionedChartCursor(
    scenario === "navigate" ? navigationCursorLeft : x + "%",
    scenario === "navigate"
      ? navigationCursorTop
      : 7 + inspectCursorRow * inspectRowPitch + "px",
    cursorTravel,
  );
  const selectorPointer = positionedSelectorCursor(
    getFilterCursorTop(elapsed) + "px",
    cursorTravel,
  );

  return (
    <div
      className="grafana-timeline-illustration"
      aria-label="Illustrative Grafana timeline"
    >
      <header className="timeline-help-preview-header">
        <strong>Orders Service</strong>
        <span>Last 1 week</span>
      </header>
      <TimelineSignalSelect
        filter={filter}
        menuOpen={menuOpen}
        target={
          menuOpen
            ? elapsed < 1800
              ? "own"
              : elapsed < 5400
                ? "dependencies"
                : "all"
            : null
        }
      />
      <div className="timeline-help-chart">
        <div className="timeline-help-labels">
          {visibleRows.map((row) => (
            <div
              key={row.id}
              className="timeline-help-label"
              data-timeline-row={row.id}
            >
              <span>{row.label}</span>
            </div>
          ))}
        </div>
        <div className="timeline-help-tracks">
          {visibleRows.map((row) => (
            <div
              key={row.id}
              className="timeline-help-track"
              data-timeline-row={row.id}
            >
              {row.states.map((state, index) => (
                <span
                  key={index}
                  className={"timeline-help-state is-" + state.toLowerCase()}
                  style={{ width: segmentWidths[index] + "%" }}
                />
              ))}
            </div>
          ))}
          {scenario !== "filter" && (
            <>
              <span
                aria-hidden="true"
                className="timeline-help-crosshair"
                style={{ left: x + "%" }}
              />
              {(inspectPopup || navigateHover) && (
                <TimelineHoverPopup x={x} inspectedRowId={inspectedRowId} />
              )}
              {navigateDetails && (
                <TimelineDependencyPopup
                  x={x}
                  linkPressed={linkPressed}
                  inspected={inspectingPayment}
                />
              )}
              <ExampleCursor
                left={trackPointer.left}
                top={trackPointer.top}
                pressed={linkPressed}
                movingToLink={movingToLink}
              />
            </>
          )}
        </div>
      </div>
      <div className="timeline-help-axis" aria-hidden="true">
        <span>Oct 09</span>
        <span>Oct 11</span>
        <span>Oct 13</span>
        <span>Oct 16</span>
      </div>
      {scenario === "filter" && (
        <ExampleCursor left={selectorPointer.left} top={selectorPointer.top} />
      )}
    </div>
  );
}
