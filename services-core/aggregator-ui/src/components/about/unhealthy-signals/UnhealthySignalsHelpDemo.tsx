import { useEffect, useState } from "react";
import SignalFlowHelpScene from "../shared/signal-flow/SignalFlowHelpScene";
import {
  expandedListHoldMs,
  progressBetween,
} from "../shared/signal-flow/progress";
import type { FlowNodeId } from "../shared/signal-flow/SignalFlowGraph";
import UnhealthySignalProjection, {
  unhealthyCycleDuration,
  unhealthyResetAt,
  getUnhealthyDiagramOpacity,
} from "./UnhealthySignalProjection";

const failureStart = 1500;
const firstLinkStart = 2400;
const firstLinkEnd = 4200;
const dependencyAffectedAt = 4400;
const secondLinkStart = 4900;
const secondLinkEnd = 6900;
const itemAffectedAt = 7100;

const leafRecoveredAt = 20200;
const firstRecoveryStart = 20800;
const firstRecoveryEnd = 22300;
const dependencyRecoveredAt = 22500;
const secondRecoveryStart = 23100;
const secondRecoveryEnd = 24600;
const itemRecoveredAt = 24800;

export default function UnhealthySignalsHelpDemo() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setElapsed(15000);
      return undefined;
    }
    const interval = window.setInterval(() => {
      setElapsed((current) => (current + 100) % unhealthyCycleDuration);
    }, 100);
    return () => window.clearInterval(interval);
  }, []);

  const sceneElapsed =
    elapsed - Math.min(expandedListHoldMs, Math.max(0, elapsed - 13800));
  const time = sceneElapsed >= unhealthyResetAt ? 0 : sceneElapsed;
  const failedLeaf = time >= failureStart && time < leafRecoveredAt;
  const affectedDependency =
    time >= dependencyAffectedAt && time < dependencyRecoveredAt;
  const affectedItem = time >= itemAffectedAt && time < itemRecoveredAt;
  const affectedNodes = new Set<FlowNodeId>();
  if (failedLeaf) affectedNodes.add("nested1");
  if (affectedDependency) affectedNodes.add("dep1");
  if (affectedItem) affectedNodes.add("item");
  const redProgress: Record<string, number> = {
    "nested1-dep1":
      time >= failureStart
        ? progressBetween(time, firstLinkStart, firstLinkEnd)
        : 0,
    "dep1-item":
      time >= dependencyAffectedAt
        ? progressBetween(time, secondLinkStart, secondLinkEnd)
        : 0,
  };
  const greenProgress: Record<string, number> = {
    "nested1-dep1":
      time >= firstRecoveryStart
        ? progressBetween(time, firstRecoveryStart, firstRecoveryEnd)
        : 0,
    "dep1-item":
      time >= secondRecoveryStart
        ? progressBetween(time, secondRecoveryStart, secondRecoveryEnd)
        : 0,
  };
  const graphOpacity = getUnhealthyDiagramOpacity(sceneElapsed);

  return (
    <SignalFlowHelpScene
      unhealthy
      elapsed={elapsed}
      cycleDuration={unhealthyCycleDuration}
      pageOpacity={1 - graphOpacity}
      graphOpacity={graphOpacity}
      affectedItem={affectedItem}
      affectedNodes={affectedNodes}
      failedLeaf={failedLeaf}
      redProgress={redProgress}
      greenProgress={greenProgress}
      renderOverlay={(targets) => (
        <UnhealthySignalProjection
          elapsed={sceneElapsed}
          dependencyFailed={affectedDependency}
          nestedFailed={failedLeaf}
          itemAffected={affectedItem}
          targets={targets}
        />
      )}
    />
  );
}
