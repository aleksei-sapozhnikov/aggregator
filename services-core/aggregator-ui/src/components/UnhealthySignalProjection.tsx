type SignalEntry = {
  id: "readiness" | "error-rate";
  title: string;
  sourceX: number;
  targetY: number;
};

const signals: SignalEntry[] = [
  { id: "readiness", title: "Readiness check", sourceX: 174, targetY: 205 },
  { id: "error-rate", title: "Error rate", sourceX: 210, targetY: 246 },
];

const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const between = (time: number, start: number, end: number): number =>
  clamp((time - start) / (end - start));
const ease = (value: number): number => value * value * (3 - 2 * value);
const mix = (start: number, end: number, t: number): number =>
  start + (end - start) * t;

export const unhealthyCycleDuration = 20200;
export const unhealthyResetAt = 19000;

export default function UnhealthySignalProjection({
  elapsed,
  dependencyAffected,
}: {
  elapsed: number;
  dependencyAffected: boolean;
}) {
  // Keep the dependency and both failing signal symbols mounted during the
  // complete forward/reverse projection to avoid a teleport between views.
  const progress = ease(between(elapsed, 9600, 12000))
    * (1 - ease(between(elapsed, 15000, 17400)));
  const selectionOpacity = between(elapsed, 8200, 9000)
    * (1 - between(elapsed, 17800, 18500));
  const pageOpacity = between(elapsed, 9300, 10500)
    * (1 - between(elapsed, 14500, 15800));
  const diagramOpacity = clamp(
    1 - between(elapsed, 9350, 10500)
      + between(elapsed, 14600, 15900),
  );
  const linksOpacity = between(progress, 0.7, 0.95);

  const depFrameX = mix(115, 130, progress);
  const depFrameY = mix(131, 158, progress);
  const depFrameWidth = mix(154, 379, progress);
  const depFrameHeight = mix(60, 38, progress);
  const depTextX = mix(144, 152, progress);
  const depTextY = mix(155, 183, progress);

  return (
    <>
      <g
        className="signal-flow-help-page signal-flow-help-unhealthy-page"
        data-unhealthy-page="true"
        style={{ opacity: pageOpacity }}
      >
        <rect
          className="signal-flow-help-page-surface"
          x="95" y="14" width="450" height="298" rx="12"
        />
        <text className="signal-flow-help-page-failed-status" x="124" y="51">×</text>
        <text className="signal-flow-help-page-title" x="150" y="51">Current Item</text>
        <line className="signal-flow-help-page-divider" x1="121" y1="67" x2="519" y2="67" />
        <text className="signal-flow-help-page-muted" x="123" y="91">Primary contact</text>
        <text className="signal-flow-help-page-contact" x="123" y="111">team@example.test</text>
        <text className="signal-flow-help-page-heading" x="123" y="143">
          ⌄ Unhealthy signals (2)
        </text>
        <line className="signal-flow-help-page-divider" x1="121" y1="151" x2="519" y2="151" />
      </g>

      <g
        data-unhealthy-source="dependency"
        className="signal-flow-help-moving-dependency"
      >
        <rect
          className="signal-flow-help-selection-frame is-unhealthy-frame"
          data-unhealthy-frame="dependency"
          x={depFrameX}
          y={depFrameY}
          width={depFrameWidth}
          height={depFrameHeight}
          rx={8}
          opacity={selectionOpacity}
        />
        <text
          className="signal-flow-help-dependency-label"
          x={depTextX}
          y={depTextY}
          style={{ fill: progress >= 0.8 ? "var(--link)" : "var(--text)" }}
        >
          Dependency 1
        </text>
        <text
          className="signal-flow-help-dependency-link-mark"
          x="270"
          y="183"
          opacity={linksOpacity}
        >
          →
        </text>
        <text
          className="signal-flow-help-dependency-tag"
          x="312"
          y="183"
          opacity={linksOpacity}
        >
          Dependency
        </text>
      </g>

      {dependencyAffected && signals.map((signal) => {
        const iconX = mix(signal.sourceX, 169, progress);
        const iconY = mix(176, signal.targetY + 24, progress);
        const frameX = mix(signal.sourceX - 12, 149, progress);
        const frameY = mix(161, signal.targetY, progress);
        const frameWidth = mix(24, 356, progress);
        const frameHeight = mix(30, 35, progress);
        return (
          <g
            key={signal.id}
            className="signal-flow-help-moving-failure"
            data-unhealthy-source={signal.id}
          >
            <rect
              className="signal-flow-help-selection-frame is-unhealthy-frame"
              data-unhealthy-frame={signal.id}
              x={frameX}
              y={frameY}
              width={frameWidth}
              height={frameHeight}
              rx={6}
              opacity={selectionOpacity}
            />
            <g
              className="signal-flow-help-alarm"
              opacity={1 - linksOpacity}
            >
              <path
                d={
                  "M" + (iconX - 9) + " " + (iconY + 8)
                  + " L" + iconX + " " + (iconY - 10)
                  + " L" + (iconX + 9) + " " + (iconY + 8) + " Z"
                }
              />
              <text x={iconX} y={iconY + 5} textAnchor="middle">!</text>
            </g>
            <text
              className="signal-flow-help-failure-marker"
              x={iconX}
              y={iconY + 5}
              textAnchor="middle"
              opacity={linksOpacity}
            >
              ×
            </text>
            <text
              className="signal-flow-help-page-link"
              x="192"
              y={signal.targetY + 25}
              opacity={linksOpacity}
            >
              {signal.title}
            </text>
          </g>
        );
      })}
      <g
        className="signal-flow-help-projection-metadata"
        data-unhealthy-morph-progress={Math.round(progress * 100)}
        data-unhealthy-diagram-opacity={diagramOpacity}
        aria-hidden="true"
      />
    </>
  );
}
