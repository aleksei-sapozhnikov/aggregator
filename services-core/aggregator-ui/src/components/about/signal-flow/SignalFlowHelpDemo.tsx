import { useCallback, useEffect, useId, useRef, useState } from "react";
import "./SignalFlowHelpDemo.css";
import ItemTitle from "../../shared/item/ItemTitle";
import ItemOwnership from "../../ItemOwnership";
import { HealthySignals, UnhealthySignals } from "../../ItemSignals";
import HelpScene, { useHelpTargets } from "../shared/HelpScene";
import DemoHelp from "../shared/DemoHelp";
import { demoIconSpriteHref, clientItem, clientContact, clientChecks, clientDependencies } from "../shared/demoData";
import HelpAnimationProgress from "../shared/HelpAnimationProgress";
import HelpInteractionShield from "../shared/HelpInteractionShield";
import UnhealthySignalProjection, {
  unhealthyCycleDuration,
  unhealthyResetAt,
  expandedListHoldMs,
  getUnhealthyDiagramOpacity,
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
  { id: "item", title: "client-service", x: 244, y: 20, width: 152, height: 60 },
  { id: "dep1", title: "client-ux", x: 115, y: 131, width: 154, height: 60 },
  { id: "dep2", title: "client-backend", x: 371, y: 131, width: 154, height: 60 },
  { id: "nested1", title: "frontend-enabler", x: 19, y: 245, width: 164, height: 60 },
  { id: "nested2", title: "auth-service", x: 202, y: 245, width: 164, height: 60 },
  { id: "nested3", title: "postgres-db", x: 457, y: 245, width: 164, height: 60 },
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

const healthyCycleDuration = 13000 + expandedListHoldMs;

// The selected Item owns these checks; dependency checks remain separate.
const ownChecks = clientChecks.map((signal, index) => ({ ...signal, offset: (index - 1) * 28 }));
const targetSelectors = {
  item: ".content-title",
  dep1: ".signals-incident-row:nth-child(1)",
  nested1: ".signals-incident-row:nth-child(2)",
  availability: ".signals-healthy-row:nth-child(1)",
  "success-ratio": ".signals-healthy-row:nth-child(2)",
  latency: ".signals-healthy-row:nth-child(3)",
};
const targetFallback = {
  item: { x: 20, y: 20, width: 460, height: 27 },
  dep1: { x: 72, y: 168, width: 408, height: 74 },
  nested1: { x: 72, y: 242, width: 408, height: 74 },
  availability: { x: 72, y: 168, width: 408, height: 34 },
  "success-ratio": { x: 72, y: 204, width: 408, height: 34 },
  latency: { x: 72, y: 240, width: 408, height: 34 },
};

const smooth = (value: number): number => value * value * (3 - 2 * value);
const failureStart = 1500;
const firstLinkStart = 2400;
const firstLinkEnd = 4200;
const dependencyAffectedAt = 4400;
const secondLinkStart = 4900;
const secondLinkEnd = 6900;
const itemAffectedAt = 7100;

// Once the projection returns to the graph, restore the leaf first.
// The green recovery travels along the same paths as the original failure.
const leafRecoveredAt = 20200;
const firstRecoveryStart = 20800;
const firstRecoveryEnd = 22300;
const dependencyRecoveredAt = 22500;
const secondRecoveryStart = 23100;
const secondRecoveryEnd = 24600;
const itemRecoveredAt = 24800;


const progressBetween = (time: number, start: number, end: number): number =>
  Math.max(0, Math.min(1, (time - start) / (end - start)));

export default function SignalFlowHelpDemo({
  mode,
}: {
  mode: SignalFlowMode;
}) {
  const [elapsed, setElapsed] = useState(0);
  const pageRef = useRef<HTMLDivElement>(null);
  const measuredTargets = useHelpTargets(pageRef, targetSelectors, targetFallback);
  const [compact, setCompact] = useState(false);
  const updateLayout = useCallback((width: number) => setCompact(width < 560), []);
  const id = useId().replace(/:/g, "");
  const greenArrow = "signal-flow-green-" + id;
  const redArrow = "signal-flow-red-" + id;
  const unhealthy = mode === "unhealthy";
  const cycleDuration = unhealthy ? unhealthyCycleDuration : healthyCycleDuration;
  const animationProgress = elapsed / cycleDuration;

  // Hold the complete, unhighlighted Item page for two extra seconds.
  // Only the scene clock pauses; the progress bar tracks the full cycle.
  const listHoldAt = unhealthy ? 13800 : 6500;
  const sceneElapsed = elapsed - Math.min(
    expandedListHoldMs,
    Math.max(0, elapsed - listHoldAt),
  );

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setElapsed(unhealthy ? 15000 : 7500);
      return undefined;
    }

    const interval = window.setInterval(() => {
      setElapsed((current) => (current + 100) % cycleDuration);
    }, 100);
    return () => window.clearInterval(interval);
  }, [unhealthy, cycleDuration]);

  // The final pause has the same all-green appearance as the initial frame.
  const time = unhealthy && sceneElapsed >= unhealthyResetAt ? 0 : sceneElapsed;
  const failedLeaf = unhealthy && time >= failureStart && time < leafRecoveredAt;
  const affectedDependency = unhealthy && time >= dependencyAffectedAt
    && time < dependencyRecoveredAt;
  const affectedItem = unhealthy && time >= itemAffectedAt && time < itemRecoveredAt;

  const affectedNodes = new Set<FlowNodeId>();
  if (failedLeaf) affectedNodes.add("nested1");
  if (affectedDependency) affectedNodes.add("dep1");
  if (affectedItem) affectedNodes.add("item");

  // Keep the existing red wires visible until a green segment overtakes them.
  const redProgress: Record<string, number> = {
    "nested1-dep1": unhealthy && time >= failureStart
      ? progressBetween(time, firstLinkStart, firstLinkEnd)
      : 0,
    "dep1-item": unhealthy && time >= dependencyAffectedAt
      ? progressBetween(time, secondLinkStart, secondLinkEnd)
      : 0,
  };
  const greenProgress: Record<string, number> = {
    "nested1-dep1": unhealthy && time >= firstRecoveryStart
      ? progressBetween(time, firstRecoveryStart, firstRecoveryEnd)
      : 0,
    "dep1-item": unhealthy && time >= secondRecoveryStart
      ? progressBetween(time, secondRecoveryStart, secondRecoveryEnd)
      : 0,
  };

  // The same three checkmarks and outlines travel from the Item into the
  // list and back, rather than being replaced with unrelated elements.
  const healthyTime = unhealthy ? 0 : sceneElapsed;
  const presentationProgress = smooth(progressBetween(healthyTime, 3500, 5600))
    * (1 - smooth(progressBetween(healthyTime, 7700, 9900)));
  // Temporarily remove selection backgrounds so the plain list is readable.
  const healthyHighlightVisibility = Math.max(0, Math.min(1,
    1 - progressBetween(healthyTime, 5800, 6300)
      + progressBetween(healthyTime, 7050, 7550),
  ));
  const selectionOpacity = progressBetween(healthyTime, 2100, 2900)
    * (1 - progressBetween(healthyTime, 10300, 11100))
    * healthyHighlightVisibility;
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
  const unhealthyDiagramOpacity = getUnhealthyDiagramOpacity(sceneElapsed);
  const pageScale = compact ? 1.2 : 0.9;
  const pageLeft = compact ? 20 : 95;
  const targets = Object.fromEntries(Object.entries(measuredTargets).map(([key, rect]) => [key, {
    x: pageLeft + rect.x * pageScale, y: rect.y * pageScale,
    width: rect.width * pageScale, height: rect.height * pageScale,
  }])) as typeof measuredTargets;
  return (
    <figure
      className={"signal-flow-help" + (unhealthy ? " is-unhealthy-demo" : " is-healthy-demo")}
      aria-label={unhealthy ? "Unhealthy dependency propagation example" : "Healthy dependency signals example"}
    >
      <HelpAnimationProgress progress={animationProgress} />
      <HelpScene width={640} height={compact ? 430 : 326} onResize={updateLayout}>
      <div ref={pageRef} inert aria-hidden="true" className="help-item-page signal-flow-help-page"
        data-unhealthy-page={unhealthy || undefined} data-healthy-page={!unhealthy || undefined}
        style={{ opacity: unhealthy ? 1 - unhealthyDiagramOpacity : pageOpacity,
          left: pageLeft, top: 0, width: 500, transform: `scale(${pageScale})` }}>
        <ItemTitle item={clientItem} firstWord="client-service" status={affectedItem ? "down" : "up"} interactive={false} />
        <section className="details-summary-block">
          <ItemOwnership primaryContact={clientContact} actorRows={[]} expanded={false}
            iconSpriteHref={demoIconSpriteHref} primaryHelp={<DemoHelp title="Primary contact" />} />
          {unhealthy ? (
            <UnhealthySignals signals={[]} dependencies={clientDependencies} expanded help={<DemoHelp title="Unhealthy signals" />} />
          ) : (
            <HealthySignals signals={clientChecks} expanded help={<DemoHelp title="Healthy signals" />} />
          )}
        </section>
      </div>
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

        <g
          className="signal-flow-help-graph"
          style={{ opacity: unhealthy ? unhealthyDiagramOpacity : diagramOpacity }}
        >
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
          if (unhealthy && (node.id === "item" || node.id === "dep1" || node.id === "nested1")) {
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
                  {(unhealthy || node.id !== "item" ? [-18, 0, 18] : []).map((offset) => (
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
            elapsed={sceneElapsed}
            dependencyFailed={affectedDependency}
            nestedFailed={failedLeaf}
            itemAffected={affectedItem}
            targets={targets}
          />
        )}

        {!unhealthy && (
          <>
            {ownChecks.map((check) => {
              const startX = 320 + check.offset - 12;
              const startY = 53;
              const target = targets[check.id as keyof typeof targets];
              const targetX = target.x;
              const targetY = target.y;
              const rectX = startX + (targetX - startX) * presentationProgress;
              const rectY = startY + (targetY - startY) * presentationProgress;
              const rectWidth = 24 + (target.width - 24) * presentationProgress;
              const rectHeight = 22 + (target.height - 22) * presentationProgress;
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
                    opacity={1 - linkOpacity}
                    x={checkX}
                    y={checkY}
                    textAnchor="middle"
                  >
                    ✓
                  </text>

                </g>
              );
            })}
          </>
        )}
      </svg>
      </HelpScene>
      <HelpInteractionShield />
    </figure>
  );
}
