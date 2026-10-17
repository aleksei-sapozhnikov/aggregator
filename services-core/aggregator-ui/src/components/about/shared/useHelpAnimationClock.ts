import { useEffect, useState } from "react";

// A single ~50 FPS clock for every help animation, including Timeline.
// Easing is defined separately so every step retains its own timing.
export const helpAnimationFrameMs = 20;

export default function useHelpAnimationClock(
  duration: number,
  stillFrame: number,
) {
  const [reduceMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
  );
  const [elapsed, setElapsed] = useState(reduceMotion ? stillFrame : 0);

  useEffect(() => {
    if (reduceMotion) {
      setElapsed(stillFrame);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setElapsed((current) => (current + helpAnimationFrameMs) % duration);
    }, helpAnimationFrameMs);
    return () => window.clearInterval(timer);
  }, [duration, stillFrame, reduceMotion]);

  return { elapsed, setElapsed, reduceMotion };
}
