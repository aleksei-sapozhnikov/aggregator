/** @file Advances deterministic help animations and supports reduced motion. */

import { useEffect, useState } from "react";

export const helpAnimationFrameMs = 20;

/** Advances an illustration cycle and provides a static frame for reduced motion. */
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
