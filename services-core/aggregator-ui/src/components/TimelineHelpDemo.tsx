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
  {
    id: "overall",
    label: "[Overall]",
    kind: "overall",
    states: ["UP", "DOWN", "UNKNOWN", "DOWN", "UP"],
  },
  {
    id: "availability",
    label: "● HTTP availability check",
    kind: "own",
    states: ["UP", "DOWN", "UP", "UP", "UP"],
  },
  {
    id: "payment",
    label: "Payment Gateway · readiness check",
    kind: "dependencies",
    item: "Payment Gateway",
    states: ["UP", "UP", "UP", "DOWN", "UP"],
  },
  {
    id: "inventory",
    label: "Inventory API · synchronization check",
    kind: "dependencies",
    item: "Inventory API",
    states: ["UP", "UP", "UNKNOWN", "UP", "UP"],
  },
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

const filterCycle: SignalFilter[] = ["all", "own", "dependencies"];
const shownStates: { label: string; state: HealthState }[] = [
  { label: "[Overall] Orders Service", state: "DOWN" },
  { label: "● HTTP availability check", state: "UP" },
  { label: "↳ Payment Gateway · readiness check", state: "DOWN" },
  { label: "↳ Inventory API · synchronization check", state: "UP" },
];

function TimelineStatusMarker({ state }: { state: HealthState }) {
  return <span className={"timeline-help-popup-marker is-" + state.toLowerCase()} aria-hidden="true" />;
}

function TimelineHoverPopup() {
  return (
    <div className="timeline-help-popup timeline-help-popup-hover" aria-label="States at selected time">
      <div className="timeline-help-popup-date">2026-10-14 23:59:45</div>
      <div className="timeline-help-popup-rows">
        {shownStates.map(({ label, state }) => (
          <div key={label} className="timeline-help-popup-row">
            <span className="timeline-help-popup-name">
              <TimelineStatusMarker state={state} />
              <span>{label}</span>
            </span>
            <strong>{state}</strong>
          </div>
        ))}
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

function TimelineSignalSelect({ filter }: { filter: SignalFilter }) {
  return (
    <div className="timeline-help-toolbar-demo" aria-label="Signal filter demonstration">
      <span className="timeline-help-toolbar-caption">Signals</span>
      <span className="timeline-help-selector">
        <span className="timeline-help-selector-value">
          {filter === "dependencies" ? "↳ " : "● "}{filter === "all" ? "↳ All" : filter === "own" ? "Own" : "Dependencies"}
          <span aria-hidden="true">⌄</span>
        </span>
        <span className="timeline-help-options" aria-hidden="true">
          {filterCycle.map((item) => (
            <span key={item} className={"timeline-help-option" + (filter === item ? " is-selected" : "")}>
              {item === "dependencies" ? "↳" : "●"} {item === "all" ? "↳ All" : item === "own" ? "Own" : "Dependencies"}
            </span>
          ))}
        </span>
        <ExampleCursor />
      </span>
    </div>
  );
}

function ExampleCursor() {
  return (
    <svg
      className="timeline-help-cursor"
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

export default function TimelineHelpDemo() {
  const [scenario, setScenario] = useState<Scenario>("inspect");
  const [filter, setFilter] = useState<SignalFilter>("all");
  const [navigationStep, setNavigationStep] = useState(0);

  useEffect(() => {
    if (scenario !== "filter") return undefined;
    const interval = window.setInterval(() => {
      setFilter((previous) => filterCycle[(filterCycle.indexOf(previous) + 1) % filterCycle.length]);
    }, 1800);
    return () => window.clearInterval(interval);
  }, [scenario]);

  useEffect(() => {
    if (scenario !== "navigate") return undefined;
    const interval = window.setInterval(() => setNavigationStep((previous) => (previous + 1) % 3), 1800);
    return () => window.clearInterval(interval);
  }, [scenario]);

  const openedItem = scenario === "navigate" && navigationStep === 2 ? "Payment Gateway" : null;

  const visibleRows = exampleRows.filter(
    (row) => row.kind === "overall" || filter === "all" || row.kind === filter,
  );
  const changeScenario = (nextScenario: Scenario) => {
    setScenario(nextScenario);
    setFilter("all");
    setNavigationStep(0);
  };

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
        <header className="timeline-help-preview-header">
          <strong>Orders Service</strong>
          <span>Example data · Last 6 hours</span>
        </header>

        {openedItem ? (
          <div className="timeline-help-destination" aria-live="polite">
            <span className="timeline-help-caption">Destination Item</span>
            <strong>{openedItem}</strong>
            <p>This is the Item associated with the selected dependency signal.</p>
            <span className="timeline-help-simulated-back">← Back to Orders Service</span>
          </div>
        ) : (
          <>
            <TimelineSignalSelect filter={filter} />

            <div className="timeline-help-chart">
              <div className="timeline-help-labels">
                {visibleRows.map((row) => (
                  <div key={row.id} className="timeline-help-label">
                    <span>
                      {row.kind === "dependencies" ? "↳ " : ""}
                      {row.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className={"timeline-help-tracks scenario-" + scenario}>
                {visibleRows.map((row) => (
                  <div key={row.id} className="timeline-help-track">
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
                    <span aria-hidden="true" className="timeline-help-crosshair is-animated" />
                    <ExampleCursor />
                  </>
                )}
              </div>
            </div>

            <div className="timeline-help-axis" aria-hidden="true">
              <span>08:00</span>
              <span>10:00</span>
              <span>12:00</span>
              <span>14:00</span>
            </div>

            {scenario === "inspect" && <TimelineHoverPopup />}
            {scenario === "navigate" && navigationStep !== 2 && (
              <TimelineDependencyPopup />
            )}
            {scenario === "filter" && (
              <p className="timeline-help-hint">
                Only signals that were DOWN or UNKNOWN during the period are listed.
                Their UP intervals remain visible.
              </p>
            )}
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
