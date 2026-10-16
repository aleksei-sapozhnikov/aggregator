import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import ItemTitle from "../../../shared/item/ItemTitle";
import ItemOwnership from "../../../shared/item/ItemOwnership";
import { HealthySignals, UnhealthySignals } from "../../../shared/item/ItemSignals";
import HelpScene, { useHelpTargets, type SceneRect } from "../HelpScene";
import DemoHelp from "../DemoHelp";
import { demoIconSpriteHref, clientItem, clientContact, clientChecks, clientDependencies } from "../demoData";
import HelpAnimationProgress from "../HelpAnimationProgress";
import HelpInteractionShield from "../HelpInteractionShield";
import SignalFlowGraph, { type FlowNodeId } from "./SignalFlowGraph";
import "./SignalFlowHelpScene.css";

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

export type SignalFlowTargets = Record<keyof typeof targetFallback, SceneRect>;

export default function SignalFlowHelpScene({
  unhealthy, elapsed, cycleDuration, pageOpacity, graphOpacity, affectedItem, affectedNodes,
  failedLeaf, redProgress, greenProgress, renderOverlay,
}: {
  unhealthy: boolean;
  elapsed: number;
  cycleDuration: number;
  pageOpacity: number;
  graphOpacity: number;
  affectedItem: boolean;
  affectedNodes: Set<FlowNodeId>;
  failedLeaf: boolean;
  redProgress: Record<string, number>;
  greenProgress: Record<string, number>;
  renderOverlay: (targets: SignalFlowTargets) => ReactNode;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const measuredTargets = useHelpTargets(pageRef, targetSelectors, targetFallback);
  const [compact, setCompact] = useState(false);
  const updateLayout = useCallback((width: number) => setCompact(width < 560), []);
  const pageScale = compact ? 1.2 : 0.9;
  const pageLeft = compact ? 20 : 95;
  const targets = Object.fromEntries(Object.entries(measuredTargets).map(([key, rect]) => [key, {
    x: pageLeft + rect.x * pageScale,
    y: rect.y * pageScale,
    width: rect.width * pageScale,
    height: rect.height * pageScale,
  }])) as SignalFlowTargets;

  return (
    <figure className={"signal-flow-help" + (unhealthy ? " is-unhealthy-demo" : " is-healthy-demo")}
      aria-label={unhealthy ? "Unhealthy dependency propagation example" : "Healthy dependency signals example"}>
      <HelpAnimationProgress progress={elapsed / cycleDuration} />
      <HelpScene width={640} height={compact ? 430 : 326} onResize={updateLayout}>
        <div ref={pageRef} inert aria-hidden="true" className="help-item-page signal-flow-help-page"
          data-unhealthy-page={unhealthy || undefined} data-healthy-page={!unhealthy || undefined}
          style={{ opacity: pageOpacity, left: pageLeft, top: 0, width: 500,
            transform: `scale(${pageScale})` }}>
          <ItemTitle item={clientItem} firstWord="client-service"
            status={affectedItem ? "down" : "up"} interactive={false} />
          <section className="details-summary-block">
            <ItemOwnership primaryContact={clientContact} actorRows={[]} expanded={false}
              iconSpriteHref={demoIconSpriteHref} primaryHelp={<DemoHelp title="Primary contact" />} />
            {unhealthy ? (
              <UnhealthySignals signals={[]} dependencies={clientDependencies} expanded
                help={<DemoHelp title="Unhealthy signals" />} />
            ) : (
              <HealthySignals signals={clientChecks} expanded help={<DemoHelp title="Healthy signals" />} />
            )}
          </section>
        </div>
        <SignalFlowGraph unhealthy={unhealthy} compact={compact} graphOpacity={graphOpacity}
          redProgress={redProgress} greenProgress={greenProgress} affectedNodes={affectedNodes}
          failedLeaf={failedLeaf}>
          {renderOverlay(targets)}
        </SignalFlowGraph>
      </HelpScene>
      <HelpInteractionShield />
    </figure>
  );
}
