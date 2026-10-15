type MovingDependency = {
  id: "dep1" | "nested1";
  title: string;
  signal: string;
  source: { x: number; y: number; width: number; height: number };
  targetY: number;
};

const dependencies: MovingDependency[] = [
  {
    id: "dep1",
    title: "client-ux",
    signal: "Error rate",
    source: { x: 115, y: 131, width: 154, height: 60 },
    targetY: 157,
  },
  {
    id: "nested1",
    title: "frontend-enabler",
    signal: "Readiness check",
    source: { x: 19, y: 245, width: 164, height: 60 },
    targetY: 232,
  },
];

const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const between = (time: number, start: number, end: number): number =>
  clamp((time - start) / (end - start));
const ease = (value: number): number => value * value * (3 - 2 * value);
const mix = (start: number, end: number, progress: number): number =>
  start + (end - start) * progress;

// Include time for the restored graph and the pause before the next failure.
export const unhealthyCycleDuration = 21800;
export const unhealthyResetAt = 20000;

// Graph and page fade in opposite directions over the entire transformation.
export const getUnhealthyDiagramOpacity = (elapsed: number): number =>
  clamp(
    1 - between(elapsed, 9600, 12800)
      + between(elapsed, 15800, 18600),
  );

export default function UnhealthySignalProjection({
  elapsed,
  nestedFailed,
  dependencyFailed,
  compact,
}: {
  elapsed: number;
  nestedFailed: boolean;
  dependencyFailed: boolean;
  compact: boolean;
}) {
  const progress = ease(between(elapsed, 9600, 12800))
    * (1 - ease(between(elapsed, 15600, 18600)));
  const pageOpacity = between(elapsed, 9600, 12800)
    * (1 - between(elapsed, 15800, 18600));
  // Keep the grouped list visible without colored boxes during its pause.
  const listHighlightVisibility = clamp(
    1 - between(elapsed, 12900, 13600)
      + between(elapsed, 14800, 15400),
  );
  const selectionOpacity = between(elapsed, 8300, 9300)
    * (1 - between(elapsed, 18900, 19600))
    * listHighlightVisibility;
  const linkOpacity = between(progress, 0.48, 0.94);
  const symbolOpacity = 1 - between(progress, 0.38, 0.88);

  return (
    <>
      <g
        className="signal-flow-help-page signal-flow-help-unhealthy-page"
        data-unhealthy-page="true"
        style={{ opacity: pageOpacity }}
      >
        <rect className="signal-flow-help-page-surface" x="0" y="0" width="640" height="326" stroke="none" />
        <g transform={compact ? "translate(-90 0)" : undefined}>
        <text className="signal-flow-help-page-failed-status" x="124" y="51">×</text>
        <text className="signal-flow-help-page-title" x="150" y="51">client-service</text>
        <line className="signal-flow-help-page-divider" x1="121" y1="67" x2={compact ? 699 : 519} y2="67" />
        <text className="signal-flow-help-page-muted" x="123" y="91">Primary contact</text>
        <text className="signal-flow-help-page-contact" x="123" y="111">team@example.test</text>
        <text className="signal-flow-help-page-heading" x="123" y="143">⌄ Unhealthy signals (2)</text>
        <line className="signal-flow-help-page-divider" x1="121" y1="151" x2={compact ? 699 : 519} y2="151" />
        </g>
      </g>

      {dependencies.map((dependency) => {
        const affected = dependency.id === "dep1" ? dependencyFailed : nestedFailed;
        const { x, y, width, height } = dependency.source;
        const destX = compact ? 33 : 126;
        const destY = dependency.targetY;
        const boxX = mix(x, destX, progress);
        const boxY = mix(y, destY, progress);
        const boxWidth = mix(width, compact ? 575 : 388, progress);
        const boxHeight = mix(height, 62, progress);
        const center = x + width / 2;
        const symbolX = mix(center, destX + 26, progress);
        const symbolY = mix(y + 48, destY + 49, progress);

        return (
          <g
            key={dependency.id}
            data-flow-node={dependency.id}
            data-health={affected ? "unhealthy" : "healthy"}
            data-unhealthy-source={dependency.id}
            className={
              "signal-flow-help-node signal-flow-help-moving-dependency"
              + (affected ? " is-affected" : "")
            }
          >
            <rect
              className="signal-flow-help-selection-frame is-unhealthy-frame"
              data-unhealthy-frame={dependency.id}
              x={boxX - 4}
              y={boxY - 4}
              width={boxWidth + 8}
              height={boxHeight + 8}
              rx={11}
              opacity={selectionOpacity}
            />
            <rect
              className="signal-flow-help-node-frame"
              x={boxX}
              y={boxY}
              width={boxWidth}
              height={boxHeight}
              rx={10}
              opacity={listHighlightVisibility}
            />
            <text
              className="signal-flow-help-node-title signal-flow-help-projected-title"
              x={mix(x + 15, destX + 17, progress)}
              y={mix(y + 24, destY + 24, progress)}
              style={{
                fill: "color-mix(in srgb, var(--link) "
                  + Math.round(progress * 100) + "%, var(--text))",
              }}
            >
              {dependency.title}
            </text>
            <text
              className="signal-flow-help-dependency-link-mark"
              x={destX + 153}
              y={destY + 24}
              opacity={linkOpacity}
            >
              →
            </text>
            <text
              className="signal-flow-help-dependency-tag"
              x={destX + 181}
              y={destY + 24}
              opacity={linkOpacity}
            >
              Dependency
            </text>

            <g className="signal-flow-help-projected-state" opacity={symbolOpacity}>
              {affected ? (
                <g
                  className="signal-flow-help-alarm"
                  data-failing-check={dependency.id === "nested1" ? "true" : undefined}
                >
                  <path
                    d={
                      "M" + (symbolX - 9) + " " + (symbolY + 3)
                      + " L" + symbolX + " " + (symbolY - 15)
                      + " L" + (symbolX + 9) + " " + (symbolY + 3) + " Z"
                    }
                  />
                  <text x={symbolX} y={symbolY} textAnchor="middle">!</text>
                </g>
              ) : (
                <g className="signal-flow-help-checks" aria-label="Passing checks">
                  {[-18, 0, 18].map((offset) => (
                    <text key={offset} x={symbolX + offset} y={symbolY} textAnchor="middle">✓</text>
                  ))}
                </g>
              )}
            </g>
            <text
              className="signal-flow-help-failure-marker"
              x={destX + 26}
              y={destY + 50}
              opacity={linkOpacity}
              textAnchor="middle"
            >
              ×
            </text>
            <text
              className="signal-flow-help-page-link"
              x={destX + 49}
              y={destY + 50}
              opacity={linkOpacity}
            >
              {dependency.signal}
            </text>
          </g>
        );
      })}
    </>
  );
}
