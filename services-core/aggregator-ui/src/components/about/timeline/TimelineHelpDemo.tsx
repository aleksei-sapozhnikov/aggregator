import { useEffect, useState } from "react";
import ItemTitle from "../../shared/item/ItemTitle";
import ItemOwnership from "../../shared/item/ItemOwnership";
import { HealthySignals } from "../../shared/item/ItemSignals";
import HelpAnimationProgress from "../shared/HelpAnimationProgress";
import HelpInteractionShield from "../shared/HelpInteractionShield";
import HelpAnimationCanvas from "../shared/HelpAnimationCanvas";
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
  navigate: 8000,
};

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
  const [elapsed, setElapsed] = useState(0);
  const [reduceMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
  );

  useEffect(() => {
    if (reduceMotion) {
      setElapsed(stillFrames[scenario]);
      return;
    }
    const interval = window.setInterval(() => {
      setElapsed((value) => (value + 100) % cycleDurations[scenario]);
    }, 100);
    return () => window.clearInterval(interval);
  }, [scenario, reduceMotion]);

  const changeScenario = (nextScenario: Scenario) => {
    setScenario(nextScenario);
    setElapsed(reduceMotion ? stillFrames[nextScenario] : 0);
  };
  const openedItem = scenario === "navigate" && elapsed >= 7300;

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
          <div inert aria-hidden="true" className="timeline-help-content">
            {openedItem ? (
              <OpenedDependencyItem />
            ) : (
              <GrafanaTimelineIllustration
                scenario={scenario}
                elapsed={elapsed}
              />
            )}
          </div>
        </div>
        <HelpInteractionShield />
      </HelpAnimationCanvas>
    </div>
  );
}
