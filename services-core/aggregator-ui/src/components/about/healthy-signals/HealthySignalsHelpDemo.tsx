import useHelpAnimationClock from "../shared/useHelpAnimationClock";
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
import { getSignalHighlightBounds } from "../shared/signal-flow/signalHighlightBounds";

const cycleDuration = 13000 + expandedListHoldMs;
const ownChecks = clientChecks.map((signal, index) => ({
  ...signal,
  offset: (index - 1) * 28,
}));

// The outer selection follows the Item as a whole, while the three inner
// selections continue to follow their individual healthy signals.
const itemSource = { x: 239, y: 15, width: 162, height: 70 };
const mix = (from: number, to: number, progress: number): number =>
  from + (to - from) * progress;

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
  const itemTarget = {
    ...getSignalHighlightBounds(targets.item),
    y: targets.item.y - 5,
    height: targets.item.height + 10,
  };

  return (
    <>
      <DemoHighlightFrame
        data-healthy-frame="item"
        x={mix(itemSource.x, itemTarget.x, presentationProgress)}
        y={mix(itemSource.y, itemTarget.y, presentationProgress)}
        width={mix(itemSource.width, itemTarget.width, presentationProgress)}
        height={mix(itemSource.height, itemTarget.height, presentationProgress)}
        color="var(--link)"
        opacity={selectionOpacity}
      />
      {ownChecks.map((check) => {
        const startX = 320 + check.offset - 12;
        const startY = 53;
        const target = targets[check.id as keyof typeof targets];
        const targetX = target.x;
        const targetY = target.y;
        const highlight = getSignalHighlightBounds(target);
        const rectX = startX + (highlight.x - startX) * presentationProgress;
        const rectY = startY + (highlight.y - startY) * presentationProgress;
        const rectWidth = 24 + (highlight.width - 24) * presentationProgress;
        const rectHeight = 22 + (highlight.height - 22) * presentationProgress;
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
  const { elapsed } = useHelpAnimationClock(cycleDuration, 7500);

  const sceneElapsed =
    elapsed - Math.min(expandedListHoldMs, Math.max(0, elapsed - 6500));
  const presentationProgress =
    smooth(progressBetween(sceneElapsed, 3500, 5000)) *
    (1 - smooth(progressBetween(sceneElapsed, 7700, 9300)));
  const selectionOpacity =
    smooth(progressBetween(sceneElapsed, 2100, 2900)) *
    (1 - smooth(progressBetween(sceneElapsed, 10300, 11100)));
  // One eased transition for the projected checks, graph and real Item page.
  const graphOpacity = 1 - presentationProgress;
  const pageOpacity = presentationProgress;
  const linkOpacity = smooth(progressBetween(presentationProgress, 0.7, 0.95));

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
