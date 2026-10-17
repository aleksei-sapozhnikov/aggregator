/** @file Displays accessible progress for looping help animations. */

import "./HelpAnimationProgress.css";

type HelpAnimationProgressProps = {
  progress: number;
};

/** Shows normalized progress through the current illustration cycle. */
export default function HelpAnimationProgress({
  progress,
}: HelpAnimationProgressProps) {
  const fraction = Math.max(0, Math.min(1, progress));

  return (
    <div
      className="help-animation-progress"
      role="progressbar"
      aria-label="Animation progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
    >
      <div
        className="help-animation-progress-fill"
        style={{
          transform: "scaleX(" + fraction + ")",
          transition: fraction === 0 ? "none" : undefined,
        }}
      />
    </div>
  );
}
