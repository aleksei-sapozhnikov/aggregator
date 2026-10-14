import { useState } from "react";
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
      "Move the pointer over the chart (or tap it) to see full signal names and their states at that moment.",
  },
  {
    id: "filter",
    title: "Filter signals",
    description:
      "Choose All, Own, or Dependencies. [Overall] stays at the top in every view.",
  },
  {
    id: "navigate",
    title: "Open a dependency",
    description:
      "Select a dependency's bar, then follow the Item link to investigate that service.",
  },
];

function getStateAt(row: TimelineRow, percent: number): HealthState {
  const index = Math.min(
    row.states.length - 1,
    Math.floor(Math.max(0, Math.min(99.99, percent)) / 20),
  );
  return row.states[index];
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
  const [position, setPosition] = useState<number | null>(null);
  const [selectedDependency, setSelectedDependency] = useState<TimelineRow | null>(
    null,
  );
  const [openedItem, setOpenedItem] = useState<string | null>(null);

  const visibleRows = exampleRows.filter(
    (row) => row.kind === "overall" || filter === "all" || row.kind === filter,
  );
  const inspectedPosition = position ?? 70;

  const changeScenario = (nextScenario: Scenario) => {
    setScenario(nextScenario);
    setFilter("all");
    setPosition(null);
    setSelectedDependency(null);
    setOpenedItem(null);
  };

  const inspectPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (scenario !== "inspect") return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const percent = ((event.clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(0, Math.min(99.99, percent)));
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
            <button type="button" onClick={() => setOpenedItem(null)}>
              ← Back to Orders Service
            </button>
          </div>
        ) : (
          <>
            <div className="timeline-help-toolbar">
              <span>Signals</span>
              <div role="group" aria-label="Signal filter" className="timeline-help-filters">
                {([
                  ["all", "All"],
                  ["own", "Own"],
                  ["dependencies", "Dependencies"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filter === value}
                    onClick={() => {
                      setFilter(value);
                      setSelectedDependency(null);
                      setPosition(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="timeline-help-chart">
              <div className="timeline-help-labels">
                {visibleRows.map((row) => (
                  <div key={row.id} className="timeline-help-label">
                    <span title={row.label}>
                      {row.kind === "dependencies" ? "↳ " : ""}
                      {row.label}
                    </span>
                  </div>
                ))}
              </div>

              <div
                className="timeline-help-tracks"
                onPointerMove={inspectPointer}
                onPointerDown={inspectPointer}
                onPointerLeave={() => setPosition(null)}
              >
                {visibleRows.map((row) => (
                  <div key={row.id} className="timeline-help-track">
                    {row.kind === "dependencies" && scenario === "navigate" ? (
                      <button
                        type="button"
                        className="timeline-help-track-link"
                        aria-label={`Inspect ${row.item} dependency signal`}
                        onClick={() => setSelectedDependency(row)}
                      >
                        {row.states.map((state, index) => (
                          <span
                            key={index}
                            className={`timeline-help-state is-${state.toLowerCase()}`}
                            style={{ width: `${segmentWidths[index]}%` }}
                          />
                        ))}
                      </button>
                    ) : (
                      row.states.map((state, index) => (
                        <span
                          key={index}
                          className={`timeline-help-state is-${state.toLowerCase()}`}
                          style={{ width: `${segmentWidths[index]}%` }}
                        />
                      ))
                    )}
                  </div>
                ))}
                {scenario === "inspect" && (
                  <>
                    <span
                      aria-hidden="true"
                      className={`timeline-help-crosshair ${position === null ? "is-animated" : ""}`}
                      style={position !== null ? { left: `${position}%` } : undefined}
                    />
                    {position === null && <ExampleCursor />}
                  </>
                )}
                {scenario === "navigate" && <ExampleCursor />}
              </div>
            </div>

            <div className="timeline-help-axis" aria-hidden="true">
              <span>08:00</span>
              <span>10:00</span>
              <span>12:00</span>
              <span>14:00</span>
            </div>

            {scenario === "inspect" && (
              <div className="timeline-help-readout" aria-label="States at selected time">
                <strong>At the selected moment</strong>
                <div>
                  {visibleRows.map((row) => {
                    const state = getStateAt(row, inspectedPosition);
                    return (
                      <div key={row.id}>
                        <span>{row.label}</span>
                        <b className={`is-${state.toLowerCase()}`}>{state}</b>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {scenario === "navigate" && (
              <div className="timeline-help-navigation">
                {selectedDependency ? (
                  <>
                    <span>
                      <strong>{selectedDependency.item}</strong>
                      {" · "}
                      {selectedDependency.label.split(" · ")[1]}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenedItem(selectedDependency.item ?? null)}
                    >
                      Open {selectedDependency.item} ↗
                    </button>
                  </>
                ) : (
                  <p>Select the Payment Gateway or Inventory API bar to see its Item link.</p>
                )}
              </div>
            )}

            {scenario === "filter" && (
              <p className="timeline-help-hint">
                A signal appears only if it was DOWN or UNKNOWN at least once
                during the selected period. Its healthy intervals remain visible.
              </p>
            )}
          </>
        )}
      </section>

      <div className="timeline-help-legend" aria-label="Timeline status colors">
        <span><i className="is-up" /> UP</span>
        <span><i className="is-down" /> DOWN</span>
        <span><i className="is-unknown" /> UNKNOWN</span>
      </div>
    </div>
  );
}
