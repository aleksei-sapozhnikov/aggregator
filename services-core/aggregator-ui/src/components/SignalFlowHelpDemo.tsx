import { useEffect, useId, useState } from "react";
import "./SignalFlowHelpDemo.css";

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

const cycleDuration = 11200;
const failureStart = 1500;
const firstLinkStart = 2400;
const firstLinkEnd = 4200;
const dependencyAffectedAt = 4400;
const secondLinkStart = 4900;
const secondLinkEnd = 6900;
const itemAffectedAt = 7100;
const resetAt = 10100;

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

  useEffect(() => {
    if (!unhealthy) {
      return undefined;
    }

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setElapsed(itemAffectedAt + 100);
      return undefined;
    }

    const interval = window.setInterval(() => {
      setElapsed((current) => (current + 100) % cycleDuration);
    }, 100);
    return () => window.clearInterval(interval);
  }, [unhealthy]);

  // During the final pause the sample resets to green before repeating.
  const time = unhealthy && elapsed >= resetAt ? 0 : elapsed;
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

  const explanation = !unhealthy
    ? "Each Item has its own passing checks. Dependency health also contributes to the current Item's overall health."
    : !failedLeaf
      ? "All checks are passing."
      : !affectedDependency
        ? "A check fails in Nested dep 1. Its impact travels toward Dependency 1."
        : !affectedItem
          ? "Dependency 1 is affected. The impact now moves toward the current Item."
          : "The current Item is unhealthy because a dependency below it is affected.";

  return (
    <figure
      className={"signal-flow-help" + (unhealthy ? " is-unhealthy-demo" : " is-healthy-demo")}
      aria-label={unhealthy ? "Unhealthy dependency propagation example" : "Healthy dependency signals example"}
    >
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
              {progress < 1 && (
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
              <text
                className="signal-flow-help-node-title"
                x={center}
                y={node.y + 24}
                textAnchor="middle"
              >
                {node.title}
              </text>
              {failingCheck ? (
                <g className="signal-flow-help-alarm" data-failing-check="true">
                  <path
                    d={"M" + (center - 9) + " " + (node.y + 53) +
                      " L" + center + " " + (node.y + 34) +
                      " L" + (center + 9) + " " + (node.y + 53) + " Z"}
                  />
                  <text x={center} y={node.y + 50} textAnchor="middle">!</text>
                </g>
              ) : affected ? (
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
                  {[-18, 0, 18].map((offset) => (
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
      </svg>
      <figcaption className="signal-flow-help-caption">
        <span className="signal-flow-help-caption-indicator" aria-hidden="true" />
        {explanation}
      </figcaption>
    </figure>
  );
}
