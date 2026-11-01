/** @file Illustrates Timeline inspection, signal filters, and dependency navigation. */

import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import ItemTitle from "../../shared/item/ItemTitle";
import ItemOwnership from "../../shared/item/ItemOwnership";
import { HealthySignals } from "../../shared/item/ItemSignals";
import HelpAnimationProgress from "../shared/HelpAnimationProgress";
import HelpInteractionShield from "../shared/HelpInteractionShield";
import HelpAnimationCanvas from "../shared/HelpAnimationCanvas";
import DemoHighlightFrame from "../shared/DemoHighlightFrame";
import { progressBetween, smooth } from "../shared/signal-flow/progress";
import useHelpAnimationClock from "../shared/useHelpAnimationClock";
import ItemTimeline from "../../shared/item/ItemTimeline";
import DemoHelp from "../shared/DemoHelp";
import {
  demoIconSpriteHref,
  paymentItem,
  paymentContact,
  paymentActors,
  paymentChecks,
} from "../shared/demoData";
import GrafanaTimelineIllustration, {
  type Scenario,
} from "./GrafanaTimelineIllustration";
import "../shared/HelpScene.css";
import "./TimelineHelpDemo.css";

export { getInspectCursorRow } from "./GrafanaTimelineIllustration";

const scenarios: { id: Scenario; title: string }[] = [
  { id: "inspect", title: "Inspect a moment" },
  { id: "filter", title: "Switch signal groups" },
  { id: "navigate", title: "Open a dependency" },
];
const cycleDurations: Record<Scenario, number> = {
  inspect: 8500,
  filter: 12000,
  navigate: 13000,
};
const stillFrames: Record<Scenario, number> = {
  inspect: 5000,
  filter: 6000,
  navigate: 8500,
};

type HighlightBounds = { x: number; y: number; width: number; height: number };
const fallbackBounds = {
  chart: { x: 12, y: 142, width: 750, height: 34 },
  item: { x: 20, y: 18, width: 350, height: 38 },
};

const interpolate = (a: number, b: number, t: number) => a + (b - a) * t;

// A single frame follows the real row, then the real Item title, and back.
export function getDependencyHighlightFrame(elapsed: number) {
  const forward = smooth(progressBetween(elapsed, 7300, 8200));
  const reverse = smooth(progressBetween(elapsed, 10200, 11100));
  return {
    towardItem: forward * (1 - reverse),
    opacity:
      smooth(progressBetween(elapsed, 6000, 6250)) *
      (1 - smooth(progressBetween(elapsed, 11500, 12600))),
  };
}

/** Measures actual chart row and Item title positions to align the moving highlight. */
function useDependencyHighlightBounds(
  rootRef: RefObject<HTMLDivElement | null>,
  scenario: Scenario,
) {
  const [bounds, setBounds] = useState(fallbackBounds);
  useLayoutEffect(() => {
    if (scenario !== "navigate") return undefined;
    const root = rootRef.current;
    if (!root) return undefined;

    const measure = () => {
      const label = root.querySelector(
        '.timeline-help-label[data-timeline-row="payment"]',
      );
      const track = root.querySelector(
        '.timeline-help-track[data-timeline-row="payment"]',
      );
      const title = root.querySelector(
        ".timeline-help-opened-item .content-title",
      );
      if (!label || !track || !title) return;
      const origin = root.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      const trackRect = track.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      if (
        labelRect.width <= 0 ||
        trackRect.width <= 0 ||
        titleRect.width <= 0
      ) {
        return;
      }
      const next = {
        chart: {
          x: labelRect.left - origin.left - 5,
          y: labelRect.top - origin.top - 5,
          width: trackRect.right - labelRect.left + 10,
          height: Math.max(labelRect.height, trackRect.height) + 10,
        },
        item: {
          x: titleRect.left - origin.left - 5,
          y: titleRect.top - origin.top - 5,
          width: titleRect.width + 10,
          height: titleRect.height + 10,
        },
      };
      setBounds((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };

    measure();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    if (observer) {
      observer.observe(root);
      const title = root.querySelector(
        ".timeline-help-opened-item .content-title",
      );
      if (title) observer.observe(title);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [rootRef, scenario]);
  return bounds;
}

function OpenedDependencyItem() {
  return (
    <div className="help-item-page" aria-label="Opened Payment Gateway Item">
      <ItemTitle
        item={paymentItem}
        firstWord="Payment"
        rest=" Gateway"
        status="up"
        interactive={false}
      />
      <section className="details-summary-block">
        <ItemOwnership
          primaryContact={paymentContact}
          actorRows={paymentActors}
          expanded={false}
          iconSpriteHref={demoIconSpriteHref}
          primaryHelp={<DemoHelp title="Primary contact" />}
          actorsHelp={<DemoHelp title="Actors" />}
        />
        <HealthySignals
          signals={paymentChecks}
          expanded={false}
          help={<DemoHelp title="Healthy signals" />}
        />
      </section>
      <ItemTimeline expanded={false} help={<DemoHelp title="Timeline" />} />
    </div>
  );
}

export default function TimelineHelpDemo() {
  const [scenario, setScenario] = useState<Scenario>("inspect");
  const { elapsed, setElapsed, reduceMotion } = useHelpAnimationClock(
    cycleDurations[scenario],
    stillFrames[scenario],
  );

  const changeScenario = (nextScenario: Scenario) => {
    setScenario(nextScenario);
    setElapsed(reduceMotion ? stillFrames[nextScenario] : 0);
  };
  const contentRef = useRef<HTMLDivElement>(null);
  const targets = useDependencyHighlightBounds(contentRef, scenario);
  const animation = getDependencyHighlightFrame(elapsed);
  const reveal = scenario === "navigate" ? animation.towardItem : 0;
  const openedItem = scenario === "navigate" && reveal > 0.5;
  const highlight: HighlightBounds = {
    x: interpolate(targets.chart.x, targets.item.x, animation.towardItem),
    y: interpolate(targets.chart.y, targets.item.y, animation.towardItem),
    width: interpolate(
      targets.chart.width,
      targets.item.width,
      animation.towardItem,
    ),
    height: interpolate(
      targets.chart.height,
      targets.item.height,
      animation.towardItem,
    ),
  };

  return (
    <div className="timeline-help">
      <nav
        className="timeline-help-scenarios"
        aria-label="Timeline help scenarios"
      >
        {scenarios.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={scenario === entry.id}
            onClick={() => changeScenario(entry.id)}
          >
            <span className="timeline-help-step" aria-hidden="true">
              {index + 1}
            </span>
            {entry.title}
          </button>
        ))}
      </nav>
      <HelpAnimationCanvas
        className="timeline-help-preview"
        ariaLabel="Example Timeline"
        maxWidth={840}
      >
        <HelpAnimationProgress
          progress={reduceMotion ? 0 : elapsed / cycleDurations[scenario]}
        />
        <div
          role="img"
          aria-label={
            openedItem
              ? "The Payment Gateway Item opens with its primary contact, actors, healthy signals and collapsed timeline"
              : "A timeline of Orders Service demonstrates inspecting states, filtering signals and opening a dependency"
          }
        >
          <div
            ref={contentRef}
            inert
            aria-hidden="true"
            className="timeline-help-content"
          >
            <div
              className="timeline-help-chart-layer"
              style={{ opacity: 1 - reveal }}
            >
              <GrafanaTimelineIllustration
                scenario={scenario}
                elapsed={elapsed}
              />
            </div>
            {scenario === "navigate" && (
              <>
                <div
                  className="timeline-help-opened-item"
                  style={{ opacity: reveal }}
                >
                  <OpenedDependencyItem />
                </div>
                <DemoHighlightFrame
                  mode="html"
                  data-timeline-dependency-highlight="true"
                  color="var(--link)"
                  x={highlight.x}
                  y={highlight.y}
                  width={highlight.width}
                  height={highlight.height}
                  opacity={animation.opacity}
                />
              </>
            )}
          </div>
        </div>
        <HelpInteractionShield />
      </HelpAnimationCanvas>
    </div>
  );
}
