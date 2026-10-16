import { useEffect, useState } from "react";
import "./TimelineHelpDemo.css";
import HelpAnimationProgress from "./HelpAnimationProgress";

type Scenario = "inspect" | "filter" | "navigate";
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
  { id: "overall", label: "[Overall] Orders Service", kind: "overall",
    states: ["UP", "DOWN", "DOWN", "UP", "UP"] },
  { id: "availability", label: "● HTTP availability check", kind: "own",
    states: ["UP", "UP", "UP", "UP", "DOWN"] },
  { id: "success", label: "● Request success ratio", kind: "own",
    states: ["UP", "DOWN", "UP", "UP", "UP"] },
  { id: "payment", label: "↳ Payment Gateway · readiness check", kind: "dependencies",
    item: "Payment Gateway", states: ["UP", "UP", "DOWN", "UP", "UP"] },
  { id: "inventory", label: "↳ Inventory API · synchronization check", kind: "dependencies",
    item: "Inventory API", states: ["UP", "UP", "UNKNOWN", "UP", "UP"] },
  { id: "notifications", label: "↳ Notification Worker · backlog check", kind: "dependencies",
    item: "Notification Worker", states: ["UP", "DOWN", "UP", "UP", "UP"] },
];

const scenarios: { id: Scenario; title: string }[] = [
  { id: "inspect", title: "Inspect a moment" },
  { id: "filter", title: "Switch signal groups" },
  { id: "navigate", title: "Open a dependency" },
];

const cycleDurations: Record<Scenario, number> = {
  inspect: 8500,
  filter: 12000,
  navigate: 13000,
};

const getFilter = (time: number): SignalFilter =>
  time >= 9200 ? "all" : time >= 5400 ? "dependencies" : time >= 1800 ? "own" : "all";

const isFilterMenuOpen = (time: number): boolean =>
  (time >= 950 && time < 1800) ||
  (time >= 4550 && time < 5400) ||
  (time >= 8350 && time < 9200);

const lerp = (start: number, end: number, fraction: number) =>
  start + (end - start) * Math.max(0, Math.min(1, fraction));

// In the inspect scenario, the pointer visits every visible signal row.
// Match the 26px track height and 7px gap in TimelineHelpDemo.css.
const inspectCursorStart = 3000;
const inspectRowDuration = 760;
const inspectRowPitch = 33;
export function getInspectCursorRow(time: number): number {
  const lastRow = exampleRows.length - 1;
  const progress = Math.max(0, Math.min(lastRow,
    (time - inspectCursorStart) / inspectRowDuration));
  const row = Math.min(lastRow - 1, Math.floor(progress));
  const movement = Math.min(1, (progress - row) / 0.66);
  const eased = movement * movement * (3 - 2 * movement);
  return row + eased;
}

function TimelineStatusMarker({ state }: { state: HealthState }) {
  return <span className={"timeline-help-popup-marker is-" + state.toLowerCase()} aria-hidden="true" />;
}

const timelineStart = Date.UTC(2026, 9, 9, 0, 0, 0);
const timelineWeekMs = 7 * 24 * 60 * 60 * 1000;
function timestampAt(position: number): string {
  const date = new Date(timelineStart + Math.round(position / 100 * timelineWeekMs));
  const pad = (value: number) => String(value).padStart(2, "0");
  return date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1) + "-" +
    pad(date.getUTCDate()) + " " + pad(date.getUTCHours()) + ":" +
    pad(date.getUTCMinutes()) + ":" + pad(date.getUTCSeconds());
}

function TimelineHoverPopup({ x, inspectedRowId }: { x: number; inspectedRowId?: string }) {
  return (
    <div
      className={"timeline-help-popup timeline-help-popup-hover" + (x >= 34 ? " is-flipped" : "")}
      style={{ left: x + "%" }}
      aria-label="States at selected time"
    >
      <div className="timeline-help-popup-date">{timestampAt(x)}</div>
      <div className="timeline-help-popup-rows">
        {exampleRows.map((row) => {
          const state = row.states[Math.min(row.states.length - 1, Math.floor(x / 20))];
          return (
            <div key={row.id}
              className={"timeline-help-popup-row" +
                (row.id === inspectedRowId ? " is-inspected" : "")}
              data-inspected={row.id === inspectedRowId ? "true" : undefined}>
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
}: {
  x: number;
  linkPressed: boolean;
}) {
  return (
    <div
      className={"timeline-help-popup timeline-help-popup-dependency" + (x >= 34 ? " is-flipped" : "")}
      style={{ left: x + "%" }}
      aria-label="Dependency signal details"
    >
      <div className="timeline-help-popup-date">
        2026-10-11 19:12:00 – 2026-10-13 04:48:00
      </div>
      <div className="timeline-help-popup-row">
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
      <div className={"timeline-help-popup-link" + (linkPressed ? " is-selected" : "")}>
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
    <div className="timeline-help-toolbar-demo" aria-label="Signal filter demonstration">
      <span className="timeline-help-toolbar-caption">Signals</span>
      <span className="timeline-help-selector">
        <span className={"timeline-help-selector-value" + (menuOpen ? " is-open" : "")}>
          {entries.find((entry) => entry.id === filter)?.name}
          <span aria-hidden="true">⌄</span>
        </span>
        {menuOpen && (
          <span className="timeline-help-options" aria-label="Available signal groups">
            {entries.map((entry) => (
              <span
                key={entry.id}
                className={[
                  "timeline-help-option",
                  filter === entry.id ? "is-selected" : "",
                  target === entry.id ? "is-targeted" : "",
                ].filter(Boolean).join(" ")}
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
      ].filter(Boolean).join(" ")}
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

function OpenedDependencyItem() {
  return (
    <div className="timeline-help-item-preview" aria-label="Opened Payment Gateway Item">
      <header className="timeline-help-item-heading">
        <span className="timeline-help-item-check" aria-hidden="true">✓</span>
        <strong>Payment Gateway</strong>
        <span className="timeline-help-item-info" aria-hidden="true">ⓘ</span>
      </header>
      <section className="timeline-help-item-primary">
        <h3>Primary contact <span aria-hidden="true">ⓘ</span></h3>
        <div>
          <span aria-hidden="true">✉</span>
          <span>finance-ops@demo.email</span>
        </div>
      </section>
      <div className="timeline-help-item-section">
        <span aria-hidden="true">›</span>
        <span aria-hidden="true">♧</span>
        <strong>Actors (2)</strong>
        <span className="timeline-help-item-question" aria-hidden="true">?</span>
      </div>
      <div className="timeline-help-item-section">
        <span aria-hidden="true">›</span>
        <span className="timeline-help-item-check" aria-hidden="true">✓</span>
        <strong>Healthy signals (5)</strong>
        <span className="timeline-help-item-question" aria-hidden="true">?</span>
      </div>
      <div className="timeline-help-item-section">
        <span aria-hidden="true">›</span>
        <span aria-hidden="true">◷</span>
        <strong>Timeline</strong>
        <span className="timeline-help-item-question" aria-hidden="true">?</span>
      </div>
    </div>
  );
}

export default function TimelineHelpDemo() {
  const [scenario, setScenario] = useState<Scenario>("inspect");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsed((value) => (value + 100) % cycleDurations[scenario]);
    }, 100);
    return () => window.clearInterval(interval);
  }, [scenario]);

  const changeScenario = (nextScenario: Scenario) => {
    setScenario(nextScenario);
    setElapsed(0);
  };

  const filter = scenario === "filter" ? getFilter(elapsed) : "all";
  const menuOpen = scenario === "filter" && isFilterMenuOpen(elapsed);
  const highlighted =
    scenario === "filter" &&
    ((elapsed >= 1800 && elapsed < 3700) || (elapsed >= 5400 && elapsed < 7400))
      ? filter
      : null;
  const visibleRows = exampleRows.filter(
    (row) => row.kind === "overall" || filter === "all" || row.kind === filter,
  );

  // The playhead is a percentage of the actual bars, shared by the line,
  // cursor, hover popup and state lookup. No independent CSS animation drives it.
  // Stop within a segment showing healthy, unhealthy and unknown signals together.
  const endX = scenario === "inspect" ? 50 : 48;
  const x = lerp(20, endX, (elapsed - 600) / 2200);
  const inspectCursorRow = getInspectCursorRow(elapsed);
  const inspectedRowId = scenario === "inspect"
    ? exampleRows[Math.round(inspectCursorRow)].id : undefined;
  const inspectPopup = scenario === "inspect" && elapsed >= 1100 && elapsed < 8150;
  const navigateHover = scenario === "navigate" && elapsed >= 1100 && elapsed < 3400;
  const navigateDetails = scenario === "navigate" && elapsed >= 3400 && elapsed < 7300;
  const openedItem = scenario === "navigate" && elapsed >= 7300;
  const linkPressed = scenario === "navigate" && elapsed >= 6400 && elapsed < 7300;
  const movingToLink = navigateDetails && elapsed >= 5100;

  // The dependency popup opens beside the chart cursor. Keep the same cursor
  // in the tracks while the popup opens, then animate it toward the Item link
  // without changing its positioning context.
  const navigationCursorLeft = movingToLink
    ? `calc(${x}% - var(--timeline-help-dependency-popup-width) + 66px)`
    : x + "%";
  const navigationCursorTop = movingToLink
    ? "var(--timeline-help-link-cursor-top)"
    : "107px";

  // The filter selector is above the bars, so its cursor uses preview coordinates.
  const cursorLeft = "172px";
  const cursorTop = menuOpen
    ? (elapsed < 1800 ? "134px" : elapsed < 5400 ? "172px" : "96px")
    : "65px";

  return (
    <div className="timeline-help">
      <nav className="timeline-help-scenarios" aria-label="Timeline help scenarios">
        {scenarios.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={scenario === entry.id}
            onClick={() => changeScenario(entry.id)}
          >
            <span className="timeline-help-step" aria-hidden="true">{index + 1}</span>
            {entry.title}
          </button>
        ))}
      </nav>
      <section className="timeline-help-preview" aria-label="Example Timeline">
        <HelpAnimationProgress progress={elapsed / cycleDurations[scenario]} />
        {openedItem ? (
          <OpenedDependencyItem />
        ) : (
          <>
            <header className="timeline-help-preview-header">
              <strong>Orders Service</strong>
              <span>Last 1 week</span>
            </header>
            <TimelineSignalSelect
              filter={filter}
              menuOpen={menuOpen}
              target={menuOpen ? (elapsed < 1800 ? "own" : elapsed < 5400 ? "dependencies" : "all") : null}
            />
            <div className="timeline-help-chart">
              <div className="timeline-help-labels">
                {visibleRows.map((row) => (
                  <div
                    key={row.id}
                    className={"timeline-help-label" + (highlighted === row.kind ? " is-highlighted" : "")}
                  >
                    <span>{row.label}</span>
                  </div>
                ))}
              </div>
              <div className="timeline-help-tracks">
                {visibleRows.map((row) => (
                  <div
                    key={row.id}
                    className={"timeline-help-track" + (highlighted === row.kind ? " is-highlighted" : "")}
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
                    {(inspectPopup || navigateHover) &&
                      <TimelineHoverPopup x={x} inspectedRowId={inspectedRowId} />}
                    {navigateDetails && (
                      <TimelineDependencyPopup x={x} linkPressed={linkPressed} />
                    )}
                    <ExampleCursor
                      left={scenario === "navigate" ? navigationCursorLeft : x + "%"}
                      top={scenario === "navigate" ? navigationCursorTop
                        : (7 + inspectCursorRow * inspectRowPitch) + "px"}
                      pressed={linkPressed}
                      movingToLink={movingToLink}
                    />
                  </>
                )}
              </div>
            </div>
            <div className="timeline-help-axis" aria-hidden="true">
              <span>Oct 09</span><span>Oct 11</span><span>Oct 13</span><span>Oct 16</span>
            </div>
            {scenario === "filter" && (
              <ExampleCursor left={cursorLeft} top={cursorTop} />
            )}
          </>
        )}
        <div className="timeline-help-interaction-shield" aria-hidden="true" />
      </section>
    </div>
  );
}
