/** @file Illustrates dependency health propagation using animated SVG nodes and edges. */

import { useId } from "react";
import type { ReactNode } from "react";

export type FlowNodeId =
  | "item"
  | "dep1"
  | "dep2"
  | "nested1"
  | "nested2"
  | "nested3";

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
  {
    id: "item",
    title: "client-service",
    x: 244,
    y: 20,
    width: 152,
    height: 60,
  },
  { id: "dep1", title: "client-ux", x: 115, y: 131, width: 154, height: 60 },
  {
    id: "dep2",
    title: "client-backend",
    x: 371,
    y: 131,
    width: 154,
    height: 60,
  },
  {
    id: "nested1",
    title: "frontend-enabler",
    x: 19,
    y: 245,
    width: 164,
    height: 60,
  },
  {
    id: "nested2",
    title: "auth-service",
    x: 202,
    y: 245,
    width: 164,
    height: 60,
  },
  {
    id: "nested3",
    title: "postgres-db",
    x: 457,
    y: 245,
    width: 164,
    height: 60,
  },
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

/** Renders the illustrative dependency graph, including failure and recovery waves. */
export default function SignalFlowGraph({
  unhealthy,
  compact,
  graphOpacity,
  redProgress,
  greenProgress,
  affectedNodes,
  failedLeaf,
  children,
}: {
  unhealthy: boolean;
  compact: boolean;
  graphOpacity: number;
  redProgress: Record<string, number>;
  greenProgress: Record<string, number>;
  affectedNodes: Set<FlowNodeId>;
  failedLeaf: boolean;
  children?: ReactNode;
}) {
  const id = useId().replace(/:/g, "");
  const greenArrow = "signal-flow-green-" + id;
  const redArrow = "signal-flow-red-" + id;
  return (
    <svg
      className="signal-flow-help-diagram"
      viewBox={`0 0 640 ${compact ? 430 : 326}`}
      data-page-layout={compact ? "compact" : "centered"}
      role="img"
      aria-label={
        unhealthy
          ? "A failing check in frontend-enabler affects client-ux, then client-service"
          : "Passing checks in six connected services flow upward through their relationships"
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

      <g className="signal-flow-help-graph" style={{ opacity: graphOpacity }}>
        {edges.map((edge, index) => {
          const progress = redProgress[edge.id] ?? 0;
          const recovery = greenProgress[edge.id] ?? 0;
          const recovered = recovery >= 1;
          const fullyRed = progress >= 1 && !recovered;
          return (
            <g key={edge.id} data-flow-edge={edge.id}>
              <path
                className="signal-flow-help-wire"
                d={edge.path}
                markerEnd={"url(#" + (fullyRed ? redArrow : greenArrow) + ")"}
              />
              {(progress === 0 || recovered) && (
                <path
                  className="signal-flow-help-current"
                  d={edge.path}
                  style={{ animationDelay: index * -0.31 + "s" }}
                />
              )}
              {progress > 0 && !recovered && (
                <path
                  className="signal-flow-help-propagation"
                  d={edge.path}
                  pathLength={100}
                  strokeDasharray="100 100"
                  strokeDashoffset={100 * (1 - progress)}
                  data-progress={Math.round(progress * 100)}
                />
              )}
              {recovery > 0 && !recovered && (
                <path
                  className="signal-flow-help-propagation is-recovery"
                  d={edge.path}
                  pathLength={100}
                  strokeDasharray="100 100"
                  strokeDashoffset={100 * (1 - recovery)}
                  data-recovery-progress={Math.round(recovery * 100)}
                />
              )}
              {fullyRed && recovery === 0 && (
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
          // Keep the Item and its affected dependencies mounted through the morph.
          if (
            unhealthy &&
            (node.id === "item" || node.id === "dep1" || node.id === "nested1")
          ) {
            return null;
          }
          const affected = affectedNodes.has(node.id);
          const failingCheck = failedLeaf && node.id === "nested1";
          const center = node.x + node.width / 2;
          return (
            <g
              key={node.id}
              data-flow-node={node.id}
              data-health={affected ? "unhealthy" : "healthy"}
              className={
                "signal-flow-help-node" + (affected ? " is-affected" : "")
              }
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
                    d={
                      "M" +
                      (center - 9) +
                      " " +
                      (node.y + 53) +
                      " L" +
                      center +
                      " " +
                      (node.y + 34) +
                      " L" +
                      (center + 9) +
                      " " +
                      (node.y + 53) +
                      " Z"
                    }
                  />
                  <text x={center} y={node.y + 50} textAnchor="middle">
                    !
                  </text>
                </g>
              ) : affected ? null : (
                <g
                  className="signal-flow-help-checks"
                  aria-label="Passing checks"
                >
                  {(unhealthy || node.id !== "item" ? [-18, 0, 18] : []).map(
                    (offset) => (
                      <text
                        key={offset}
                        x={center + offset}
                        y={node.y + 48}
                        textAnchor="middle"
                      >
                        ✓
                      </text>
                    ),
                  )}
                </g>
              )}
            </g>
          );
        })}
      </g>

      {children}
    </svg>
  );
}
