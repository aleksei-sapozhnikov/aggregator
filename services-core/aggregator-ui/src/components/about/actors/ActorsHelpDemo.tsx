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
  color: string;
};

const actors: Actor[] = [
  {
    id: "owner",
    start: [98, 191],
    sceneScale: 0.65,
    role: "Owner",
    color: "#4384c5",
  },
  {
    id: "user",
    start: [322, 191],
    sceneScale: 0.65,
    role: "User",
    color: "#50b28b",
  },
  {
    id: "support",
    start: [210, 56],
    sceneScale: 0.55,
    role: "Support",
    color: "#a38cdb",
  },
];

function ActorCharacter({ actor }: { actor: Actor }) {
  return (
    <g className={"actors-help-person actors-help-person-" + actor.id}>
      <ellipse cx="50" cy="136" rx="33" ry="6" fill="#d2d9e1" opacity=".65" />
      <path
        d="M28 115 21 136h20l9-28 12 28h20l-9-37Z"
        fill="#33495e"
        stroke="#243442"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M17 88Q18 69 37 66H65Q83 69 87 88L82 114H19Z"
        fill={actor.color}
        stroke="#273b4c"
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <path
        d="M35 69Q33 82 51 84Q67 82 65 69"
        fill="none"
        stroke="#273b4c"
        strokeWidth="2.5"
      />
      <rect x="44" y="58" width="13" height="13" rx="5" fill="#f5b98d" />
      <ellipse
        cx="51"
        cy="42"
        rx="26"
        ry="29"
        fill="#f6c29b"
        stroke="#243442"
        strokeWidth="2.5"
      />
      {actor.id === "owner" && (
        <path
          d="M26 45Q15 5 55 9Q81 4 78 32L68 30Q62 18 48 25Q33 20 26 45Z"
          fill="#343942"
          stroke="#243442"
          strokeWidth="2"
        />
      )}
      {actor.id === "user" && (
        <path
          d="M25 40Q17 6 50 8Q80 8 77 42Q65 27 53 22Q39 34 25 40Z"
          fill="#9b593b"
          stroke="#243442"
          strokeWidth="2"
        />
      )}
      {actor.id === "support" && (
        <>
          <path
            d="M25 39Q16 7 49 9Q81 10 76 43L67 33Q53 18 38 31Z"
            fill="#483b46"
            stroke="#243442"
            strokeWidth="2"
          />
          <path
            d="M23 48Q17 21 32 15M79 48Q84 22 69 15"
            fill="none"
            stroke="#273b4c"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <rect
            x="17"
            y="42"
            width="9"
            height="19"
            rx="4"
            fill="#f5c15b"
            stroke="#273b4c"
            strokeWidth="2"
          />
          <rect
            x="76"
            y="42"
            width="9"
            height="19"
            rx="4"
            fill="#f5c15b"
            stroke="#273b4c"
            strokeWidth="2"
          />
        </>
      )}
      <circle cx="42" cy="43" r="2" fill="#263440" />
      <circle cx="62" cy="43" r="2" fill="#263440" />
      <path
        d="M44 57Q51 62 59 55"
        fill="none"
        stroke="#263440"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {actor.id === "owner" && (
        <>
          <g className="actors-help-moving-arm">
            <path
              d="M23 83 10 103 32 111"
              fill="none"
              stroke={actor.color}
              strokeWidth="15"
              strokeLinecap="round"
            />
            <circle cx="32" cy="111" r="7" fill="#f6c29b" />
          </g>
          <path
            d="M74 83 89 108"
            fill="none"
            stroke={actor.color}
            strokeWidth="15"
            strokeLinecap="round"
          />
          <g className="actors-help-laptop">
            <rect
              x="13"
              y="98"
              width="64"
              height="37"
              rx="4"
              fill="#304d67"
              stroke="#243442"
              strokeWidth="3"
            />
            <path
              d="M8 136h74"
              stroke="#243442"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="46" cy="114" r="5" fill="#8bacc8" />
            <g className="actors-help-typing">
              <path
                d="M21 125 29 121M34 126 42 122"
                stroke="#f6c29b"
                strokeWidth="6"
                strokeLinecap="round"
              />
            </g>
          </g>
        </>
      )}
      {actor.id === "user" && (
        <>
          <path
            d="M20 82 11 108 26 115M79 82 89 109 74 115"
            fill="none"
            stroke={actor.color}
            strokeWidth="14"
            strokeLinecap="round"
          />
          <g className="actors-help-tablet">
            <rect
              x="26"
              y="92"
              width="49"
              height="49"
              rx="7"
              fill="#35556a"
              stroke="#253a4a"
              strokeWidth="2.5"
            />
            <rect x="31" y="97" width="39" height="37" rx="4" fill="#f4f8fb" />
            <path
              d="m41 115 7 7 15-17"
              fill="none"
              stroke="#52b88d"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <g className="actors-help-moving-arm">
            <path
              d="M75 92 65 112"
              stroke="#f6c29b"
              strokeWidth="7"
              strokeLinecap="round"
            />
          </g>
        </>
      )}
      {actor.id === "support" && (
        <>
          <path
            d="M22 85 16 111 38 119M79 85 89 111 72 119"
            fill="none"
            stroke={actor.color}
            strokeWidth="14"
            strokeLinecap="round"
          />
          <g className="actors-help-wrench">
            <path
              d="M78 88 56 124"
              stroke="#576b7e"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <path
              d="M80 75q-13 3-10 16l10 5q13-2 14-15l-9 5-6-4Z"
              fill="#b0c1cf"
              stroke="#33495e"
              strokeWidth="2.5"
            />
            <circle
              cx="54"
              cy="127"
              r="5"
              fill="#b0c1cf"
              stroke="#33495e"
              strokeWidth="2"
            />
          </g>
          <circle cx="72" cy="119" r="7" fill="#f6c29b" />
        </>
      )}
    </g>
  );
}

function Machine() {
  return (
    <g className="actors-help-machine">
      <ellipse cx="94" cy="224" rx="105" ry="12" fill="#ccd5de" opacity=".55" />
      <rect
        x="14"
        y="21"
        width="158"
        height="192"
        rx="20"
        fill="#81a6bf"
        stroke="#314d64"
        strokeWidth="5"
      />
      <path
        d="M148 31 179 16q13-3 14 13v171l-21 13V43Z"
        fill="#53758f"
        stroke="#314d64"
        strokeWidth="4"
      />
      <path d="M15 48h157M15 188h157" stroke="#52758f" strokeWidth="3" />
      <rect
        x="38"
        y="7"
        width="117"
        height="27"
        rx="6"
        fill="#52758f"
        stroke="#314d64"
        strokeWidth="4"
      />
      <rect
        x="81"
        y="-5"
        width="31"
        height="21"
        rx="7"
        fill="#f2c76b"
        stroke="#75502b"
        strokeWidth="4"
      />
      <path
        d="M90-12V-18M104-11l7-8M76-7l-8-8"
        stroke="#d6a13f"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect
        x="41"
        y="62"
        width="108"
        height="101"
        rx="12"
        fill="#293f54"
        stroke="#314d64"
        strokeWidth="4"
      />
      <g className="actors-help-gear" transform="translate(88 111)">
        <circle r="30" fill="#98b8ce" stroke="#304e65" strokeWidth="4" />
        {Array.from({ length: 8 }, (_, index) => (
          <rect
            key={index}
            x="-6"
            y="-39"
            width="12"
            height="18"
            rx="2"
            fill="#98b8ce"
            stroke="#304e65"
            strokeWidth="2"
            transform={"rotate(" + index * 45 + ")"}
          />
        ))}
        <circle r="13" fill="#496981" stroke="#304e65" strokeWidth="4" />
      </g>
      <circle
        cx="126"
        cy="136"
        r="15"
        fill="#7094af"
        stroke="#304e65"
        strokeWidth="4"
      />
      <circle cx="126" cy="136" r="6" fill="#304e65" />
      <rect x="50" y="179" width="88" height="16" rx="5" fill="#52758f" />
      {[0, 1, 2].map((index) => (
        <rect
          key={index}
          x={57 + index * 28}
          y="184"
          width="17"
          height="6"
          rx="2"
          fill="#b0c9d9"
        />
      ))}
      <path
        d="M174 83h18q10 0 10 10v63q0 8-9 8h-17"
        fill="none"
        stroke="#314d64"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M174 83h18q10 0 10 10v63q0 8-9 8h-17"
        fill="none"
        stroke="#c4d2dc"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle
        className="actors-help-light"
        cx="26"
        cy="82"
        r="8"
        fill="#78d887"
        stroke="#305e59"
        strokeWidth="3"
      />
      <circle
        cx="26"
        cy="111"
        r="8"
        fill="#f5cd69"
        stroke="#85672f"
        strokeWidth="3"
      />
      <circle cx="26" cy="140" r="5" fill="#ef9b67" />
    </g>
  );
}

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
                <Machine />
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
                    <ActorCharacter actor={actor} />
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
