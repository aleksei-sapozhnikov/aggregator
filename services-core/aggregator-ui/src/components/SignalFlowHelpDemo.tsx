import { useEffect, useId, useState } from "react";
import "./SignalFlowHelpDemo.css";
import HelpAnimationProgress from "./HelpAnimationProgress";
import UnhealthySignalProjection, {
  unhealthyCycleDuration,
  unhealthyResetAt,
} from "./UnhealthySignalProjection";

type SignalFlowMode = "healthy" | "unhealthy";
type FlowNodeId = "item" | "dep1" | "dep2" | "nested1" | "nested2" | "nested3";

type FlowNode = {
  id: FlowNodeId;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type FlowEdge = {
  id: string;
  path: string;
  source: FlowNodeId;
  destination: FlowNodeId;
};

const nodes: FlowNode[] = [
  { id: "item", title: "Current Item", x: 244, y: 20, width: 152, height: 60 },
  { id: "dep1", title: "Dependency 1", x: 115, y: 131, width: 154, height: 60 },
  { id: "dep2", title: "Dependency 2", x: 371, y: 131, width: 154, height: 60 },
  { id: "nested1", title: "Nested dep 1", x: 19, y: 245, width: 164, height: 60 },
  { id: "nested2", title: "Nested dep 2", x: 202, y: 245, width: 164, height: 60 },
  { id: "nested3", title: "Nested dep 3", x: 457, y: 245, width: 164, height: 60 },
];

// Every path runs from a dependency upward toward the Item that uses it.
const edges: FlowEdge[] = [
  {
    id: "nested1-dep1",
    path: "M101 245 C101 222 192 217 192 191",
    source: "nested1",
    destination: "dep1",
  },
  {
    id: "nested2-dep1",
    path: "M284 245 C284 222 192 217 192 191",
    source: "nested2",
    destination: "dep1",
  },
  {
    id: "nested3-dep2",
    path: "M539 245 C539 222 448 217 448 191",
    source: "nested3",
    destination: "dep2",
  },
  {
    id: "dep1-item",
    path: "M192 131 C192 105 320 106 320 80",
    source: "dep1",
    destination: "item",
  },
  {
    id: "dep2-item",
    path: "M448 131 C448 105 320 106 320 80",
    source: "dep2",
    destination: "item",
  },
];

const healthyCycleDuration = 13000;

// The selected Item owns these checks. Dependencies have separate checks
// but their passing checks are not included in this Item's Healthy signals.
const ownChecks = [
  { id: "availability", label: "Availability", offset: -28 },
  { id: "success-ratio", label: "Success ratio", offset: 0 },
  { id: "latency", label: "Latency", offset: 28 },
] as const;

const smooth = (value: number): number => value * value * (3 - 2 * value);
const failureStart = 1500;
const firstLinkStart = 2400;
const firstLinkEnd = 4200;
const dependencyAffectedAt = 4400;
const secondLinkStart = 4900;
const secondLinkEnd = 6900;
const itemAffectedAt = 7100;


const progressBetween = (time: number, start: number, end: number): number =>
  Math.max(0, Math.min(1, (time - start) / (end - start)));

export default function SignalFlowHelpDemo({
  mode,
}: {
  mode: SignalFlowMode;
}) {
  const [elapsed, setElapsed] = useState(0);
  const id = useId().replace(/:/g, "");
  const greenArrow = "signal-flow-green-" + id;
  const redArrow = "signal-flow-red-" + id;
  const unhealthy = mode === "unhealthy";
  const cycleDuration = unhealthy ? unhealthyCycleDuration : healthyCycleDuration;
  const animationProgress = elapsed / cycleDuration;

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setElapsed(unhealthy ? 13000 : 6500);
      return undefined;
    }

    const interval = window.setInterval(() => {
      setElapsed((current) => (current + 100) % cycleDuration);
    }, 100);
    return () => window.clearInterval(interval);
  }, [unhealthy, cycleDuration]);

  // During the final pause the sample resets to green before repeating.
  const time = unhealthy && elapsed >= unhealthyResetAt ? 0 : elapsed;
  const failedLeaf = unhealthy && time >= failureStart;
  const affectedDependency = unhealthy && time >= dependencyAffectedAt;
  const affectedItem = unhealthy && time >= itemAffectedAt;

  const affectedNodes = new Set<FlowNodeId>();
  if (failedLeaf) affectedNodes.add("nested1");
  if (affectedDependency) affectedNodes.add("dep1");
  if (affectedItem) affectedNodes.add("item");

  const redProgress: Record<string, number> = {
    "nested1-dep1": unhealthy && failedLeaf
      ? progressBetween(time, firstLinkStart, firstLinkEnd)
      : 0,
    "dep1-item": unhealthy && affectedDependency
      ? progressBetween(time, secondLinkStart, secondLinkEnd)
      : 0,
  };

  // The same three checkmarks and outlines travel from the Item into the
  // list and back, rather than being replaced with unrelated elements.
  const healthyTime = unhealthy ? 0 : elapsed;
  const presentationProgress = smooth(progressBetween(healthyTime, 3500, 5600))
    * (1 - smooth(progressBetween(healthyTime, 7700, 9900)));
  const selectionOpacity = progressBetween(healthyTime, 2100, 2900)
    * (1 - progressBetween(healthyTime, 10300, 11100));
  const diagramOpacity = Math.min(
    1,
    Math.max(
      0,
      1 - progressBetween(healthyTime, 3450, 4450)
        + progressBetween(healthyTime, 8250, 9500),
    ),
  );
  const pageOpacity = progressBetween(healthyTime, 3400, 4500)
    * (1 - progressBetween(healthyTime, 8200, 9300));
  const linkOpacity = progressBetween(presentationProgress, 0.7, 0.95);
  const unhealthyDiagramOpacity = Math.min(
    1,
    Math.max(
      0,
      1 - progressBetween(elapsed, 9350, 10500)
        + progressBetween(elapsed, 14600, 15900),
    ),
  );
  const explanation = !unhealthy
    ? healthyTime < 2200
      ? "All Items have their own checks. Watch which ones appear in this Item's Healthy signals."
      : healthyTime < 7600
        ? "Only the current Item's three passing checks become links in its Healthy signals list."
        : "The same links return to the checks on the current Item."
    : !failedLeaf
      ? "All checks are passing."
      : !affectedDependency
        ? "A check fails in Nested dep 1. Its impact travels toward Dependency 1."
        : !affectedItem
          ? "Dependency 1 is affected. The impact now moves toward the current Item."
          : elapsed < 8200
            ? "The nested failure affects Dependency 1's readiness and error-rate checks."
            : elapsed < 14700
              ? "Dependency 1 and its two failing checks appear under Unhealthy signals."
              : elapsed < 19000
                ? "The dependency and its failing signals return to the graph."
                : "All checks are passing. The example will repeat.";

  return (
    <figure
      className={"signal-flow-help" + (unhealthy ? " is-unhealthy-demo" : " is-healthy-demo")}
      aria-label={unhealthy ? "Unhealthy dependency propagation example" : "Healthy dependency signals example"}
    >
      <HelpAnimationProgress progress={animationProgress} />
      <svg
        className="signal-flow-help-diagram"
        viewBox="0 0 640 326"
        role="img"
        aria-label={
          unhealthy
            ? "A failing check in Nested dependency 1 affects Dependency 1, then the current Item"
            : "Passing checks in six connected items flow upward through the dependency graph"
        }
      >
        <defs>
          <marker
            id={greenArrow}
            viewBox="0 0 8 8"
            markerWidth="5"
            markerHeight="5"
            refX="7.5"
            refY="4"
            orient="auto"
          >
            <path d="M0 0 L8 4 L0 8 Z" fill="var(--status-up)" />
          </marker>
          <marker
            id={redArrow}
            viewBox="0 0 8 8"
            markerWidth="5"
            markerHeight="5"
            refX="7.5"
            refY="4"
            orient="auto"
          >
            <path d="M0 0 L8 4 L0 8 Z" fill="var(--status-down)" />
          </marker>
        </defs>

        <g
          className="signal-flow-help-graph"
          style={{ opacity: unhealthy ? unhealthyDiagramOpacity : diagramOpacity }}
        >
        {edges.map((edge, index) => {
          const progress = redProgress[edge.id] ?? 0;
          const fullyRed = progress >= 1;
          return (
            <g key={edge.id} data-flow-edge={edge.id}>
              <path
                className="signal-flow-help-wire"
                d={edge.path}
                markerEnd={"url(#" + (fullyRed ? redArrow : greenArrow) + ")"}
              />
              {progress === 0 && (
                <path
                  className="signal-flow-help-current"
                  d={edge.path}
                  style={{ animationDelay: index * -0.31 + "s" }}
                />
              )}
              {progress > 0 && (
                <path
                  className="signal-flow-help-propagation"
                  d={edge.path}
                  pathLength={100}
                  strokeDasharray="100 100"
                  strokeDashoffset={100 * (1 - progress)}
                  data-progress={Math.round(progress * 100)}
                />
              )}
              {fullyRed && (
                <path
                  className="signal-flow-help-current is-red"
                  d={edge.path}
                  style={{ animationDelay: index * -0.31 + "s" }}
                />
              )}
            </g>
          );
        })}

        {nodes.map((node) => {
          const affected = affectedNodes.has(node.id);
          const failingCheck = failedLeaf && node.id === "nested1";
          const center = node.x + node.width / 2;
          return (
            <g
              key={node.id}
              data-flow-node={node.id}
              data-health={affected ? "unhealthy" : "healthy"}
              className={"signal-flow-help-node" + (affected ? " is-affected" : "")}
            >
              <rect
                className="signal-flow-help-node-frame"
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx={11}
              />
              {!(unhealthy && node.id === "dep1") && (
                <text
                  className="signal-flow-help-node-title"
                  x={center}
                  y={node.y + 24}
                  textAnchor="middle"
                >
                  {node.title}
                </text>
              )}
              {failingCheck ? (
                <g className="signal-flow-help-alarm" data-failing-check="true">
                  <path
                    d={"M" + (center - 9) + " " + (node.y + 53) +
                      " L" + center + " " + (node.y + 34) +
                      " L" + (center + 9) + " " + (node.y + 53) + " Z"}
                  />
                  <text x={center} y={node.y + 50} textAnchor="middle">!</text>
                </g>
              ) : affected && !(unhealthy && node.id === "dep1") ? (
                <text
                  className="signal-flow-help-impacted-label"
                  x={center}
                  y={node.y + 47}
                  textAnchor="middle"
                >
                  Affected by dependency
                </text>
              ) : (
                <g className="signal-flow-help-checks" aria-label="Passing checks">
                  {(unhealthy
                    ? (node.id === "dep1" && affected ? [] : [-18, 0, 18])
                    : node.id !== "item" ? [-18, 0, 18] : []
                  ).map((offset) => (
                    <text
                      key={offset}
                      x={center + offset}
                      y={node.y + 48}
                      textAnchor="middle"
                    >
                      ✓
                    </text>
                  ))}
                </g>
              )}
            </g>
          );
        })}
        </g>

        {unhealthy && (
          <UnhealthySignalProjection
            elapsed={elapsed}
            dependencyAffected={affectedDependency}
          />
        )}

        {!unhealthy && (
          <>
            <g
              className="signal-flow-help-page"
              data-healthy-page="true"
              style={{ opacity: pageOpacity }}
            >
              <rect className="signal-flow-help-page-surface" x="95" y="14" width="450" height="298" rx="12" />
              <text className="signal-flow-help-page-status" x="124" y="51">✓</text>
              <text className="signal-flow-help-page-title" x="150" y="51">Current Item</text>
              <line className="signal-flow-help-page-divider" x1="121" y1="67" x2="519" y2="67" />
              <text className="signal-flow-help-page-muted" x="123" y="91">Primary contact</text>
              <text className="signal-flow-help-page-contact" x="123" y="111">team@example.test</text>
              <text className="signal-flow-help-page-heading" x="123" y="143">⌄ Healthy signals (3)</text>
              <line className="signal-flow-help-page-divider" x1="121" y1="151" x2="519" y2="151" />
            </g>

            {ownChecks.map((check, index) => {
              const startX = 320 + check.offset - 12;
              const startY = 53;
              const targetX = 132;
              const targetY = 157 + index * 41;
              const rectX = startX + (targetX - startX) * presentationProgress;
              const rectY = startY + (targetY - startY) * presentationProgress;
              const rectWidth = 24 + (374 - 24) * presentationProgress;
              const rectHeight = 22 + (35 - 22) * presentationProgress;
              const checkX = 320 + check.offset +
                (targetX + 19 - 320 - check.offset) * presentationProgress;
              const checkY = 69 + (targetY + 25 - 69) * presentationProgress;
              return (
                <g
                  key={check.id}
                  className="signal-flow-help-owned-signal"
                  data-own-signal={check.id}
                >
                  <rect
                    className="signal-flow-help-selection-frame"
                    data-selection-frame={check.id}
                    x={rectX}
                    y={rectY}
                    width={rectWidth}
                    height={rectHeight}
                    rx={6}
                    opacity={selectionOpacity}
                  />
                  <text
                    className="signal-flow-help-owned-check"
                    x={checkX}
                    y={checkY}
                    textAnchor="middle"
                  >
                    ✓
                  </text>
                  <text
                    className="signal-flow-help-page-link"
                    x={targetX + 40}
                    y={targetY + 24}
                    opacity={linkOpacity}
                  >
                    {check.label}
                  </text>
                  <text
                    className="signal-flow-help-page-link-arrow"
                    x={targetX + 352}
                    y={targetY + 24}
                    opacity={linkOpacity}
                    textAnchor="end"
                  >
                    ↗
                  </text>
                </g>
              );
            })}
          </>
        )}
      </svg>
      <figcaption className="signal-flow-help-caption">
        <span className="signal-flow-help-caption-indicator" aria-hidden="true" />
        {explanation}
      </figcaption>
    </figure>
  );
}
