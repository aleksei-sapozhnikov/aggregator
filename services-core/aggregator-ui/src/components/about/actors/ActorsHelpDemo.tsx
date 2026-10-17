import { useRef } from "react";
import type { RefObject } from "react";
import ItemTitle from "../../shared/item/ItemTitle";
import ItemOwnership from "../../shared/item/ItemOwnership";
import HelpScene, { useHelpTargets } from "../shared/HelpScene";
import DemoHelp from "../shared/DemoHelp";
import {
  demoIconSpriteHref,
  ordersItem,
  ordersContact,
  ordersActors,
} from "../shared/demoData";
import HelpAnimationProgress from "../shared/HelpAnimationProgress";
import HelpInteractionShield from "../shared/HelpInteractionShield";
import HelpAnimationCanvas from "../shared/HelpAnimationCanvas";
import useHelpAnimationClock from "../shared/useHelpAnimationClock";
import { progressBetween, smooth } from "../shared/signal-flow/progress";
import DemoWoodLabel from "../shared/DemoWoodLabel";
import OwnerCharacter from "../shared/characters/OwnerCharacter";
import UserCharacter from "../shared/characters/UserCharacter";
import SupportCharacter from "../shared/characters/SupportCharacter";
import ServiceMachine from "../shared/characters/ServiceMachine";
import "./ActorsHelpDemo.css";

// The HTML page and illustrated sprites scale together; destinations follow its DOM rows.
export const actorsHelpDuration = 8000;
const previewTime = 4600;
const between = progressBetween;
const lerp = (start: number, end: number, factor: number) =>
  start + (end - start) * factor;

export function getActorsHelpFrame(time: number) {
  // Move into the Item rows, hold the sprites for two seconds, then return.
  const travel =
    smooth(between(time, 1800, 3600)) *
    (1 - smooth(between(time, 5600, 7400)));
  const pageOpacity =
    smooth(between(time, 2250, 3500)) *
    (1 - smooth(between(time, 5750, 7350)));
  return { travel, pageOpacity };
}

type Role = "owner" | "user" | "support";
type Actor = {
  id: Role;
  start: [number, number];
  sceneScale: number;
  role: string;
};

const actors: Actor[] = [
  {
    id: "owner",
    start: [98, 191],
    sceneScale: 0.65,
    role: "Owner",
  },
  {
    id: "user",
    start: [322, 191],
    sceneScale: 0.65,
    role: "User",
  },
  {
    id: "support",
    start: [210, 56],
    sceneScale: 0.55,
    role: "Support",
  },
];

const pageX = 15;
const pageScale = 0.78;
const actorSelectors = {
  owner: ".ownership-extra-list li:nth-child(1) .actor-summary-row",
  user: ".ownership-extra-list li:nth-child(2) .actor-summary-row",
  support: ".ownership-extra-list li:nth-child(3) .actor-summary-row",
  item: ".content-title .catalog-item-info",
};
const actorFallback = {
  owner: { x: 72, y: 178, width: 210, height: 34 },
  user: { x: 72, y: 214, width: 190, height: 34 },
  support: { x: 72, y: 250, width: 150, height: 34 },
  item: { x: 242, y: 20, width: 26, height: 26 },
};

function ItemPreview({
  opacity,
  pageRef,
}: {
  opacity: number;
  pageRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={pageRef}
      className="help-item-page actors-help-item"
      inert
      aria-hidden="true"
      style={{
        opacity,
        left: pageX,
        top: 0,
        width: 500,
        transform: `scale(${pageScale})`,
      }}
    >
      <ItemTitle
        item={ordersItem}
        firstWord="Order"
        rest=" Fulfillment"
        status="up"
        interactive={false}
      />
      <section className="details-summary-block">
        <ItemOwnership
          primaryContact={ordersContact}
          actorRows={ordersActors}
          expanded
          iconSpriteHref={demoIconSpriteHref}
          primaryHelp={<DemoHelp title="Primary contact" />}
          actorsHelp={<DemoHelp title="Actors" />}
        />
      </section>
    </div>
  );
}

export default function ActorsHelpDemo() {
  const { elapsed, reduceMotion } = useHelpAnimationClock(
    actorsHelpDuration,
    previewTime,
  );
  const pageRef = useRef<HTMLDivElement>(null);
  const targets = useHelpTargets(pageRef, actorSelectors, actorFallback);

  const frame = getActorsHelpFrame(elapsed);
  const illustrating = !reduceMotion && (elapsed < 1800 || elapsed >= 7400);
  const moving = frame.travel;

  return (
    <HelpAnimationCanvas
      className={
        "actors-help-demo" +
        (reduceMotion ? " is-still" : "") +
        (illustrating ? " is-illustrating" : "")
      }
      ariaLabel="Actors become Item ownership and relationship entries"
      maxWidth={452}
    >
      <HelpAnimationProgress progress={elapsed / actorsHelpDuration} />
      <HelpScene width={420} height={310}>
        <ItemPreview
          pageRef={pageRef}
          opacity={reduceMotion ? 1 : frame.pageOpacity}
        />
        <svg
          viewBox="0 0 420 310"
          className="actors-help-diagram"
          role="img"
          aria-label="Three people work with a service, become Owner, User, and Support rows on an Item page, then return"
        >
          {!reduceMotion && (
            <g
              data-service="item"
              transform={
                "translate(" +
                lerp(
                  210,
                  pageX +
                    (targets.item.x + targets.item.width + 20) * pageScale,
                  moving,
                ) +
                " " +
                lerp(
                  197,
                  (targets.item.y + targets.item.height / 2) * pageScale,
                  moving,
                ) +
                ")"
              }
            >
              <g
                data-service-sprite="true"
                transform={
                  "scale(" +
                  lerp(0.49, 0.078, moving).toFixed(3) +
                  ") translate(-94 -110)"
                }
              >
                <ServiceMachine />
              </g>
              <g
                aria-hidden="true"
                style={{ opacity: 1 - smooth(between(moving, 0.12, 0.7)) }}
              >
                <DemoWoodLabel x={0} y={83} width={74} label="Service" />
              </g>
            </g>
          )}
          {!reduceMotion &&
            actors.map((actor) => {
              const target = targets[actor.id];
              const x = lerp(
                actor.start[0],
                pageX + (target.x + target.width + 20) * pageScale,
                moving,
              );
              const y = lerp(
                actor.start[1],
                (target.y + target.height / 2) * pageScale,
                moving,
              );
              const scale = lerp(actor.sceneScale, 0.2, moving);
              return (
                <g
                  key={actor.id}
                  data-actor={actor.id}
                  transform={"translate(" + x + " " + y + ")"}
                >
                  <g
                    data-actor-sprite="true"
                    transform={"scale(" + scale + ") translate(-50 -70)"}
                  >
                    {actor.id === "owner" ? (
                      <OwnerCharacter />
                    ) : actor.id === "user" ? (
                      <UserCharacter />
                    ) : (
                      <SupportCharacter />
                    )}
                  </g>
                  <g
                    aria-hidden="true"
                    style={{ opacity: 1 - smooth(between(moving, 0.12, 0.7)) }}
                  >
                    <DemoWoodLabel
                      x={0}
                      y={actor.id === "support" ? 45 : 52}
                      width={
                        actor.id === "support"
                          ? 80
                          : actor.id === "owner"
                            ? 70
                            : 62
                      }
                      label={actor.role}
                    />
                  </g>
                </g>
              );
            })}
        </svg>
      </HelpScene>
      <HelpInteractionShield />
    </HelpAnimationCanvas>
  );
}
