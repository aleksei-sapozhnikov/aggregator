/** @file Animates failing checks propagating through dependencies and their recovery. */

import useHelpAnimationClock from "../shared/useHelpAnimationClock";
import SignalFlowHelpScene from "../shared/signal-flow/SignalFlowHelpScene";
import {
  expandedListHoldMs,
  progressBetween,
} from "../shared/signal-flow/progress";
import type { FlowNodeId } from "../shared/signal-flow/SignalFlowGraph";
import { unhealthyTiming as timing } from "./UnhealthySignalTiming";
import UnhealthySignalProjection, {
  unhealthyCycleDuration,
  unhealthyResetAt,
  getUnhealthyDiagramOpacity,
} from "./UnhealthySignalProjection";

/** Illustrates how failing signals spread through dependencies and recover. */
export default function UnhealthySignalsHelpDemo() {
  const { elapsed } = useHelpAnimationClock(
    unhealthyCycleDuration,
    timing.pageHoldAt,
  );

  const sceneElapsed =
    elapsed -
    Math.min(expandedListHoldMs, Math.max(0, elapsed - timing.pageHoldAt));
  const time = sceneElapsed >= unhealthyResetAt ? 0 : sceneElapsed;
  const failedLeaf = time >= timing.failureStart && time < timing.leafRecoveredAt;
  const affectedDependency =
    time >= timing.dependencyAffectedAt && time < timing.dependencyRecoveredAt;
  const affectedItem =
    time >= timing.itemAffectedAt && time < timing.itemRecoveredAt;
  const affectedNodes = new Set<FlowNodeId>();
  if (failedLeaf) affectedNodes.add("nested1");
  if (affectedDependency) affectedNodes.add("dep1");
  if (affectedItem) affectedNodes.add("item");
  const redProgress: Record<string, number> = {
    "nested1-dep1":
      time >= timing.failureStart
        ? progressBetween(time, timing.firstLinkStart, timing.firstLinkEnd)
        : 0,
    "dep1-item":
      time >= timing.dependencyAffectedAt
        ? progressBetween(time, timing.secondLinkStart, timing.secondLinkEnd)
        : 0,
  };
  const greenProgress: Record<string, number> = {
    "nested1-dep1":
      time >= timing.firstRecoveryStart
        ? progressBetween(
            time,
            timing.firstRecoveryStart,
            timing.firstRecoveryEnd,
          )
        : 0,
    "dep1-item":
      time >= timing.secondRecoveryStart
        ? progressBetween(
            time,
            timing.secondRecoveryStart,
            timing.secondRecoveryEnd,
          )
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
