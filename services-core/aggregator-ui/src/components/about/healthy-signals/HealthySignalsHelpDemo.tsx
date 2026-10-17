import { useEffect, useState } from "react";
import SignalFlowHelpScene, {
  type SignalFlowTargets,
} from "../shared/signal-flow/SignalFlowHelpScene";
import {
  expandedListHoldMs,
  progressBetween,
  smooth,
} from "../shared/signal-flow/progress";
import { clientChecks } from "../shared/demoData";
import DemoHighlightFrame from "../shared/DemoHighlightFrame";

const cycleDuration = 13000 + expandedListHoldMs;
const ownChecks = clientChecks.map((signal, index) => ({
  ...signal,
  offset: (index - 1) * 28,
}));

function HealthySignalHighlights({
  targets,
  presentationProgress,
  selectionOpacity,
  linkOpacity,
}: {
  targets: SignalFlowTargets;
  presentationProgress: number;
  selectionOpacity: number;
  linkOpacity: number;
}) {
  return (
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
        const checkX =
          320 +
          check.offset +
          (targetX + 19 - 320 - check.offset) * presentationProgress;
        const checkY = 69 + (targetY + 25 - 69) * presentationProgress;
        return (
          <g
            key={check.id}
            className="signal-flow-help-owned-signal"
            data-own-signal={check.id}
          >
            <DemoHighlightFrame
              data-selection-frame={check.id}
              x={rectX}
              y={rectY}
              width={rectWidth}
              height={rectHeight}
              color="var(--link)"
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
  );
}

export default function HealthySignalsHelpDemo() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setElapsed(7500);
      return undefined;
    }
    const interval = window.setInterval(() => {
      setElapsed((current) => (current + 100) % cycleDuration);
    }, 100);
    return () => window.clearInterval(interval);
  }, []);

  const sceneElapsed =
    elapsed - Math.min(expandedListHoldMs, Math.max(0, elapsed - 6500));
  const presentationProgress =
    smooth(progressBetween(sceneElapsed, 3500, 5600)) *
    (1 - smooth(progressBetween(sceneElapsed, 7700, 9900)));
  const selectionOpacity =
    progressBetween(sceneElapsed, 2100, 2900) *
    (1 - progressBetween(sceneElapsed, 10300, 11100));
  const graphOpacity = Math.min(
    1,
    Math.max(
      0,
      1 -
        progressBetween(sceneElapsed, 3450, 4450) +
        progressBetween(sceneElapsed, 8250, 9500),
    ),
  );
  const pageOpacity =
    progressBetween(sceneElapsed, 3400, 4500) *
    (1 - progressBetween(sceneElapsed, 8200, 9300));
  const linkOpacity = progressBetween(presentationProgress, 0.7, 0.95);

  return (
    <SignalFlowHelpScene
      unhealthy={false}
      elapsed={elapsed}
      cycleDuration={cycleDuration}
      pageOpacity={pageOpacity}
      graphOpacity={graphOpacity}
      affectedItem={false}
      affectedNodes={new Set()}
      failedLeaf={false}
      redProgress={{}}
      greenProgress={{}}
      renderOverlay={(targets) => (
        <HealthySignalHighlights
          targets={targets}
          presentationProgress={presentationProgress}
          selectionOpacity={selectionOpacity}
          linkOpacity={linkOpacity}
        />
      )}
    />
  );
}
