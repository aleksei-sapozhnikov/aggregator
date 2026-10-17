/** @file Projects failing dependency signals into the selected Item preview. */

import type { SceneRect } from "../shared/HelpScene";
import {
  expandedListHoldMs,
  progressBetween,
  smooth,
} from "../shared/signal-flow/progress";
import DemoHighlightFrame from "../shared/DemoHighlightFrame";
import { unhealthyTiming as timing } from "./UnhealthySignalTiming";
import { getSignalHighlightBounds } from "../shared/signal-flow/signalHighlightBounds";

type MovingDependency = {
  id: "dep1" | "nested1";
  title: string;
  source: { x: number; y: number; width: number; height: number };
};

const dependencies: MovingDependency[] = [
  {
    id: "dep1",
    title: "client-ux",
    source: { x: 115, y: 131, width: 154, height: 60 },
  },
  {
    id: "nested1",
    title: "frontend-enabler",
    source: { x: 19, y: 245, width: 164, height: 60 },
  },
];

/** Clamps animation progress to the inclusive zero-to-one range. */
const clamp = (value: number): number => Math.max(0, Math.min(1, value));
/** Interpolates illustration geometry between two values. */
const mix = (start: number, end: number, progress: number): number =>
  start + (end - start) * progress;

// Keep the existing page hold and a half-second green pause after recovery.
export { expandedListHoldMs } from "../shared/signal-flow/progress";
export const unhealthyResetAt = timing.resetAt;
export const unhealthyCycleDuration =
  unhealthyResetAt + 500 + expandedListHoldMs;

// Graph and page fade in opposite directions over the entire transformation.
export const getUnhealthyDiagramOpacity = (elapsed: number): number =>
  clamp(
    1 -
      smooth(
        progressBetween(
          elapsed,
          timing.presentationStart,
          timing.presentationEnd,
        ),
      ) +
      smooth(progressBetween(elapsed, timing.reverseStart, timing.reverseEnd)),
  );

/** Connects failed dependencies to their corresponding Item signal rows. */
export default function UnhealthySignalProjection({
  elapsed,
  nestedFailed,
  dependencyFailed,
  itemAffected,
  targets,
}: {
  elapsed: number;
  nestedFailed: boolean;
  dependencyFailed: boolean;
  itemAffected: boolean;
  targets: Record<"item" | "dep1" | "nested1", SceneRect>;
}) {
  const progress =
    smooth(
      progressBetween(
        elapsed,
        timing.presentationStart,
        timing.presentationEnd,
      ),
    ) *
    (1 -
      smooth(progressBetween(elapsed, timing.reverseStart, timing.reverseEnd)));
  // Keep highlighting visible during the expanded-list pause.
  const selectionOpacity =
    progressBetween(elapsed, timing.selectionStart, timing.selectionFull) *
    (1 -
      progressBetween(
        elapsed,
        timing.selectionFadeStart,
        timing.selectionFadeEnd,
      ));
  const symbolOpacity = 1 - smooth(progressBetween(progress, 0.38, 0.88));
  const itemHighlight = getSignalHighlightBounds(targets.item, 4);

  return (
    <>
      {/* Graph nodes travel to the measured DOM rows, then yield to the real UI. */}
      <g
        data-flow-node="item"
        data-health={itemAffected ? "unhealthy" : "healthy"}
        data-unhealthy-source="item"
        className={
          "signal-flow-help-node signal-flow-help-moving-dependency signal-flow-help-moving-item" +
          (itemAffected ? " is-affected" : "")
        }
      >
        <DemoHighlightFrame
          data-unhealthy-frame="item"
          x={mix(248, itemHighlight.x, progress)}
          y={mix(24, itemHighlight.y, progress)}
          width={mix(144, itemHighlight.width, progress)}
          height={mix(52, itemHighlight.height, progress)}
          color="var(--status-down)"
          opacity={selectionOpacity}
        />
        <rect
          className="signal-flow-help-node-frame"
          data-moving-item-box="true"
          x={mix(244, targets.item.x, progress)}
          y={mix(20, targets.item.y, progress)}
          width={mix(152, targets.item.width, progress)}
          height={mix(60, targets.item.height, progress)}
          rx={10}
          opacity={symbolOpacity}
        />
        <text
          className="signal-flow-help-node-title signal-flow-help-moving-item-title"
          data-moving-item-title="true"
          opacity={symbolOpacity}
          x={mix(274, targets.item.x + 28, progress)}
          y={mix(44, targets.item.y + 24, progress)}
          style={{ fontSize: mix(15, 19, progress) + "px" }}
        >
          client-service
        </text>
        <g opacity={symbolOpacity}>
          {!itemAffected && (
            <g className="signal-flow-help-checks" aria-label="Passing checks">
              {[-18, 0, 18].map((offset) => (
                <text
                  key={offset}
                  x={mix(320 + offset, targets.item.x + 12, progress)}
                  y={mix(68, targets.item.y + 24, progress)}
                  textAnchor="middle"
                >
                  ✓
                </text>
              ))}
            </g>
          )}
        </g>
      </g>

      {dependencies.map((dependency) => {
        const affected =
          dependency.id === "dep1" ? dependencyFailed : nestedFailed;
        const { x, y, width, height } = dependency.source;
        const target = targets[dependency.id];
        const destX = target.x;
        const destY = target.y;
        const boxX = mix(x, destX, progress);
        const boxY = mix(y, destY, progress);
        const boxWidth = mix(width, target.width, progress);
        const boxHeight = mix(height, target.height, progress);
        const center = x + width / 2;
        const symbolX = mix(center, destX + 26, progress);
        const symbolY = mix(y + 48, destY + 49, progress);
        const highlight = getSignalHighlightBounds(target, 4);

        return (
          <g
            key={dependency.id}
            data-flow-node={dependency.id}
            data-health={affected ? "unhealthy" : "healthy"}
            data-unhealthy-source={dependency.id}
            className={
              "signal-flow-help-node signal-flow-help-moving-dependency" +
              (affected ? " is-affected" : "")
            }
          >
            <DemoHighlightFrame
              data-unhealthy-frame={dependency.id}
              x={mix(x + 4, highlight.x, progress)}
              y={mix(y + 4, highlight.y, progress)}
              width={mix(width - 8, highlight.width, progress)}
              height={mix(height - 8, highlight.height, progress)}
              color="var(--status-down)"
              opacity={selectionOpacity}
            />
            <rect
              className="signal-flow-help-node-frame"
              x={boxX}
              y={boxY}
              width={boxWidth}
              height={boxHeight}
              rx={10}
              opacity={symbolOpacity}
            />
            <text
              className="signal-flow-help-node-title"
              opacity={symbolOpacity}
              x={mix(x + 15, destX + 17, progress)}
              y={mix(y + 24, destY + 24, progress)}
            >
              {dependency.title}
            </text>
            <g
              className="signal-flow-help-projected-state"
              opacity={symbolOpacity}
            >
              {affected ? (
                <g
                  className="signal-flow-help-alarm"
                  data-failing-check={
                    dependency.id === "nested1" ? "true" : undefined
                  }
                >
                  <path
                    d={
                      "M" +
                      (symbolX - 9) +
                      " " +
                      (symbolY + 3) +
                      " L" +
                      symbolX +
                      " " +
                      (symbolY - 15) +
                      " L" +
                      (symbolX + 9) +
                      " " +
                      (symbolY + 3) +
                      " Z"
                    }
                  />
                  <text x={symbolX} y={symbolY} textAnchor="middle">
                    !
                  </text>
                </g>
              ) : (
                <g
                  className="signal-flow-help-checks"
                  aria-label="Passing checks"
                >
                  {[-18, 0, 18].map((offset) => (
                    <text
                      key={offset}
                      x={symbolX + offset}
                      y={symbolY}
                      textAnchor="middle"
                    >
                      ✓
                    </text>
                  ))}
                </g>
              )}
            </g>
          </g>
        );
      })}
    </>
  );
}
