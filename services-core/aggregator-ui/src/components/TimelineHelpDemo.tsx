import { useEffect, useState } from "react";
import "./TimelineHelpDemo.css";

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
    item: "Inventory API", states: ["UP", "UP", "UP", "UNKNOWN", "UP"] },
  { id: "notifications", label: "↳ Notification Worker · backlog check", kind: "dependencies",
    item: "Notification Worker", states: ["UP", "DOWN", "UP", "UP", "UP"] },
];

const scenarios: { id: Scenario; title: string; description: string }[] = [
  {
    id: "inspect",
    title: "Inspect a moment",
    description:
      "Watch the cursor reveal the full names and health states for one moment.",
  },
  {
    id: "filter",
    title: "Switch signal groups",
    description:
      "Watch the signal selector switch between All, Own, and Dependencies. [Overall] remains visible.",
  },
  {
    id: "navigate",
    title: "Open a dependency",
    description:
      "The selected dependency segment has a popup containing an Item link. Watch it open the dependency.",
  },
];

const cycleDurations: Record<Scenario, number> = {
  inspect: 8500,
  filter: 9500,
  navigate: 13000,
};

const getFilter = (time: number): SignalFilter =>
  time >= 5400 ? "dependencies" : time >= 1800 ? "own" : "all";

const isFilterMenuOpen = (time: number): boolean =>
  (time >= 950 && time < 1800) || (time >= 4550 && time < 5400);

const lerp = (start: number, end: number, fraction: number) =>
  start + (end - start) * Math.max(0, Math.min(1, fraction));

function TimelineStatusMarker({ state }: { state: HealthState }) {
  return <span className={"timeline-help-popup-marker is-" + state.toLowerCase()} aria-hidden="true" />;
}

function TimelineHoverPopup({ x }: { x: number }) {
  return (
    <div
      className="timeline-help-popup timeline-help-popup-hover"
      style={{ left: String(12 + x * 0.26) + "%" }}
      aria-label="States at selected time"
    >
      <div className="timeline-help-popup-date">2026-10-14 23:59:45</div>
      <div className="timeline-help-popup-rows">
        {exampleRows.map((row) => {
          const state = row.states[Math.min(4, Math.floor(x / 20))];
          return (
            <div key={row.id} className="timeline-help-popup-row">
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

function TimelineDependencyPopup() {
  return (
    <div className="timeline-help-popup timeline-help-popup-dependency" aria-label="Dependency signal details">
      <div className="timeline-help-popup-date">
        2026-10-14 23:57:45 – 2026-10-15 00:04:00
      </div>
      <div className="timeline-help-popup-row">
        <span className="timeline-help-popup-name">
          <TimelineStatusMarker state="UP" />
          <span>↳ Payment Gateway · readiness check</span>
        </span>
        <strong>UP</strong>
      </div>
      <div className="timeline-help-popup-duration">
        <span>Duration</span>
        <strong>6m 15s</strong>
      </div>
      <div className="timeline-help-popup-link">
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
}: {
  left: string;
  top: string;
  pressed?: boolean;
}) {
  return (
    <svg
      className={"timeline-help-cursor" + (pressed ? " is-pressed" : "")}
      style={{ left, top }}
      viewBox="0 0 24 28"
      focusable="false"
      aria-hidden="true"
    >
      <path
        d="M2 2v21l5.7-5.3 3.5 8 4-1.9-3.8-7.9H20L2 2Z"
        fill="var(--panel)"
        stroke="var(--text)"
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
        <span aria-hidden="true">⌄</span>
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

  // All cursor, popup, selection and highlight changes share this clock.
  // The inspect cursor holds its final position with the popup for over three seconds.
  const x = lerp(22, 58, (elapsed - 700) / 1950);
  const inspectPopup = scenario === "inspect" && elapsed >= 1300 && elapsed < 8100;
  const navigateHover = scenario === "navigate" && elapsed >= 1100 && elapsed < 3400;
  const navigateDetails = scenario === "navigate" && elapsed >= 3400 && elapsed < 7300;
  const openedItem = scenario === "navigate" && elapsed >= 7300;
  const linkPressed = scenario === "navigate" && elapsed >= 6400 && elapsed < 7300;

  let cursorLeft = String(30 + x * 0.56) + "%";
  let cursorTop = "185px";
  if (scenario === "filter") {
    cursorLeft = "172px";
    cursorTop = menuOpen ? (elapsed < 1800 ? "134px" : "172px") : "65px";
  } else if (scenario === "navigate") {
    cursorLeft = elapsed >= 5000 ? "52%" : String(30 + x * 0.56) + "%";
    cursorTop = elapsed >= 5000 ? "289px" : "207px";
  }

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
            <span className="timeline-help-step">{index + 1}</span>
            {entry.title}
          </button>
        ))}
      </nav>
      <p className="timeline-help-description">
        {scenarios.find((entry) => entry.id === scenario)?.description}
      </p>
      <section className="timeline-help-preview" aria-label="Example Timeline">
        {openedItem ? (
          <OpenedDependencyItem />
        ) : (
          <>
            <header className="timeline-help-preview-header">
              <strong>Orders Service</strong>
              <span>Example data · Last 6 hours</span>
            </header>
            <TimelineSignalSelect
              filter={filter}
              menuOpen={menuOpen}
              target={menuOpen ? (elapsed < 1800 ? "own" : "dependencies") : null}
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
              </div>
            </div>
            <div className="timeline-help-axis" aria-hidden="true">
              <span>08:00</span><span>10:00</span><span>12:00</span><span>14:00</span>
            </div>
            {(inspectPopup || navigateHover) && <TimelineHoverPopup x={x} />}
            {navigateDetails && <TimelineDependencyPopup />}
            {scenario !== "filter" && (
              <span
                aria-hidden="true"
                className="timeline-help-crosshair"
                style={{ left: String(30 + x * 0.56) + "%" }}
              />
            )}
            <ExampleCursor left={cursorLeft} top={cursorTop} pressed={linkPressed} />
          </>
        )}
        <div className="timeline-help-interaction-shield" aria-hidden="true" />
      </section>
      <div className="timeline-help-legend" aria-label="Timeline status colors">
        <span><i className="is-up" /> UP</span>
        <span><i className="is-down" /> DOWN</span>
        <span><i className="is-unknown" /> UNKNOWN</span>
      </div>
    </div>
  );
}
