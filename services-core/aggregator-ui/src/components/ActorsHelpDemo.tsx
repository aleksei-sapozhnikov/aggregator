import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import HelpAnimationProgress from "./HelpAnimationProgress";
import "./ActorsHelpDemo.css";

// All positions use one SVG coordinate system, including the Item preview.
// This keeps each actor's destination aligned when the modal is resized.
export const actorsHelpDuration = 11200;
const previewTime = 7000;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const between = (time: number, start: number, end: number) =>
  clamp((time - start) / (end - start));
const smooth = (value: number) => value * value * (3 - 2 * value);
const lerp = (start: number, end: number, factor: number) =>
  start + (end - start) * factor;

export function getActorsHelpFrame(time: number) {
  // Scene, 2s beside rows, 2s clean Item, restore sprites, reverse.
  const travel = smooth(between(time, 1800, 3600)) *
    (1 - smooth(between(time, 8600, 10450)));
  const pageOpacity = smooth(between(time, 2250, 3500)) *
    (1 - smooth(between(time, 8950, 10450)));
  const markerOpacity = 1 - smooth(between(time, 5650, 6050)) *
    (1 - smooth(between(time, 8150, 8600)));
  return {
    travel,
    pageOpacity,
    sceneOpacity: 1 - pageOpacity,
    actorOpacity: markerOpacity,
    machineOpacity: markerOpacity,
  };
}

type Role = "owner" | "user" | "other";
type Actor = {
  id: Role;
  start: [number, number];
  destination: [number, number];
  name: string;
  role: string;
  color: string;
};

const actors: Actor[] = [
  { id: "owner", start: [102, 165], destination: [98, 206],
    name: "Order Platform Team", role: "Owner", color: "#4384c5" },
  { id: "user", start: [539, 137], destination: [98, 240],
    name: "Fulfillment Operators", role: "User", color: "#50b28b" },
  { id: "other", start: [537, 257], destination: [98, 274],
    name: "Customer Support", role: "Other", color: "#a38cdb" },
];

function ActorCharacter({ actor }: { actor: Actor }) {
  return (
    <g className={"actors-help-person actors-help-person-" + actor.id}>
      <ellipse cx="50" cy="136" rx="33" ry="6" fill="#d2d9e1" opacity=".65" />
      <path d="M28 115 21 136h20l9-28 12 28h20l-9-37Z"
        fill="#33495e" stroke="#243442" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M17 88Q18 69 37 66H65Q83 69 87 88L82 114H19Z"
        fill={actor.color} stroke="#273b4c" strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M35 69Q33 82 51 84Q67 82 65 69" fill="none"
        stroke="#273b4c" strokeWidth="2.5" />
      <rect x="44" y="58" width="13" height="13" rx="5" fill="#f5b98d" />
      <ellipse cx="51" cy="42" rx="26" ry="29"
        fill="#f6c29b" stroke="#243442" strokeWidth="2.5" />
      {actor.id === "owner" && (
        <path d="M26 45Q15 5 55 9Q81 4 78 32L68 30Q62 18 48 25Q33 20 26 45Z"
          fill="#343942" stroke="#243442" strokeWidth="2" />
      )}
      {actor.id === "user" && (
        <path d="M25 40Q17 6 50 8Q80 8 77 42Q65 27 53 22Q39 34 25 40Z"
          fill="#9b593b" stroke="#243442" strokeWidth="2" />
      )}
      {actor.id === "other" && (
        <>
          <path d="M25 39Q16 7 49 9Q81 10 76 43L67 33Q53 18 38 31Z"
            fill="#483b46" stroke="#243442" strokeWidth="2" />
          <path d="M23 48Q17 21 32 15M79 48Q84 22 69 15"
            fill="none" stroke="#273b4c" strokeWidth="4" strokeLinecap="round" />
          <rect x="17" y="42" width="9" height="19" rx="4" fill="#f5c15b"
            stroke="#273b4c" strokeWidth="2" />
          <rect x="76" y="42" width="9" height="19" rx="4" fill="#f5c15b"
            stroke="#273b4c" strokeWidth="2" />
        </>
      )}
      <circle cx="42" cy="43" r="2" fill="#263440" />
      <circle cx="62" cy="43" r="2" fill="#263440" />
      <path d="M44 57Q51 62 59 55" fill="none"
        stroke="#263440" strokeWidth="2" strokeLinecap="round" />
      {actor.id === "owner" && (
        <>
          <g className="actors-help-moving-arm">
            <path d="M23 83 10 103 32 111" fill="none"
              stroke={actor.color} strokeWidth="15" strokeLinecap="round" />
            <circle cx="32" cy="111" r="7" fill="#f6c29b" />
          </g>
          <path d="M74 83 89 108" fill="none" stroke={actor.color}
            strokeWidth="15" strokeLinecap="round" />
          <rect x="13" y="98" width="64" height="37" rx="4"
            fill="#304d67" stroke="#243442" strokeWidth="3" />
          <path d="M8 136h74" stroke="#243442" strokeWidth="5" strokeLinecap="round" />
          <circle cx="46" cy="114" r="5" fill="#8bacc8" />
          <g className="actors-help-typing">
            <path d="M21 125 29 121M34 126 42 122"
              stroke="#f6c29b" strokeWidth="5" strokeLinecap="round" />
          </g>
        </>
      )}
      {actor.id === "user" && (
        <>
          <path d="M20 82 11 108 26 115M79 82 89 109 74 115"
            fill="none" stroke={actor.color} strokeWidth="14" strokeLinecap="round" />
          <rect x="26" y="92" width="49" height="49" rx="7"
            fill="#35556a" stroke="#253a4a" strokeWidth="2.5" />
          <rect x="31" y="97" width="39" height="37" rx="4" fill="#f4f8fb" />
          <path d="m41 115 7 7 15-17" fill="none"
            stroke="#52b88d" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <g className="actors-help-moving-arm">
            <path d="M75 92 65 112" stroke="#f6c29b" strokeWidth="7" strokeLinecap="round" />
          </g>
        </>
      )}
      {actor.id === "other" && (
        <>
          <path d="M22 85 16 111 38 119M79 85 89 111 72 119"
            fill="none" stroke={actor.color} strokeWidth="14" strokeLinecap="round" />
          <g className="actors-help-wrench">
            <path d="M78 88 56 124" stroke="#576b7e"
              strokeWidth="9" strokeLinecap="round" />
            <path d="M80 75q-13 3-10 16l10 5q13-2 14-15l-9 5-6-4Z"
              fill="#b0c1cf" stroke="#33495e" strokeWidth="2.5" />
            <circle cx="54" cy="127" r="5" fill="#b0c1cf"
              stroke="#33495e" strokeWidth="2" />
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
      <rect x="14" y="21" width="158" height="192" rx="20"
        fill="#81a6bf" stroke="#314d64" strokeWidth="5" />
      <path d="M148 31 179 16q13-3 14 13v171l-21 13V43Z"
        fill="#53758f" stroke="#314d64" strokeWidth="4" />
      <path d="M15 48h157M15 188h157" stroke="#52758f" strokeWidth="3" />
      <rect x="38" y="7" width="117" height="27" rx="6"
        fill="#52758f" stroke="#314d64" strokeWidth="4" />
      <rect x="81" y="-5" width="31" height="21" rx="7" fill="#f2c76b"
        stroke="#75502b" strokeWidth="4" />
      <path d="M90-12V-18M104-11l7-8M76-7l-8-8" stroke="#d6a13f"
        strokeWidth="3" strokeLinecap="round" />
      <rect x="41" y="62" width="108" height="101" rx="12"
        fill="#293f54" stroke="#314d64" strokeWidth="4" />
      <g className="actors-help-gear" transform="translate(88 111)">
        <circle r="30" fill="#98b8ce" stroke="#304e65" strokeWidth="4" />
        {Array.from({ length: 8 }, (_, index) => (
          <rect key={index} x="-6" y="-39" width="12" height="18" rx="2"
            fill="#98b8ce" stroke="#304e65" strokeWidth="2"
            transform={"rotate(" + index * 45 + ")"} />
        ))}
        <circle r="13" fill="#496981" stroke="#304e65" strokeWidth="4" />
      </g>
      <circle cx="126" cy="136" r="15" fill="#7094af" stroke="#304e65" strokeWidth="4" />
      <circle cx="126" cy="136" r="6" fill="#304e65" />
      <rect x="50" y="179" width="88" height="16" rx="5" fill="#52758f" />
      {[0, 1, 2].map((index) => (
        <rect key={index} x={57 + index * 28} y="184"
          width="17" height="6" rx="2" fill="#b0c9d9" />
      ))}
      <path d="M174 83h18q10 0 10 10v63q0 8-9 8h-17"
        fill="none" stroke="#314d64" strokeWidth="14" strokeLinecap="round" />
      <path d="M174 83h18q10 0 10 10v63q0 8-9 8h-17"
        fill="none" stroke="#c4d2dc" strokeWidth="7" strokeLinecap="round" />
      <circle className="actors-help-light" cx="26" cy="82" r="8"
        fill="#78d887" stroke="#305e59" strokeWidth="3" />
      <circle cx="26" cy="111" r="8" fill="#f5cd69"
        stroke="#85672f" strokeWidth="3" />
      <circle cx="26" cy="140" r="5" fill="#ef9b67" />
    </g>
  );
}

function ActorIcon() {
  return (
    <g fill="none" stroke="#172336" strokeWidth="2.3"
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="0" cy="-4" r="3" />
      <path d="M-6 7q0-7 6-7t6 7" />
      <circle cx="10" cy="-3" r="2.5" />
      <path d="M8 2q6-1 7 5" />
    </g>
  );
}

function ItemPreview({ opacity }: { opacity: number }) {
  return (
    <g className="actors-help-item" style={{ opacity }} aria-hidden="true">
      <rect x="12" y="9" width="616" height="308" rx="8"
        fill="#f5f6f8" stroke="#d8dadd" />
      <text x="34" y="48" className="actors-help-check">✓</text>
      <text x="86" y="48" className="actors-help-title">Order Fulfillment</text>
      <circle cx="273" cy="40" r="8" fill="none"
        stroke="#1550b3" strokeWidth="1.8" />
      <text x="273" y="45" className="actors-help-info" textAnchor="middle">i</text>
      <text x="295" y="46" className="actors-help-up">UP</text>
      <path d="M39 83v66" stroke="#2f6feb" strokeWidth="3" />
      <text x="65" y="101" className="actors-help-heading">Primary contact</text>
      <circle cx="202" cy="95" r="9" fill="none" stroke="#9da5b2" />
      <text x="202" y="99" className="actors-help-question" textAnchor="middle">?</text>
      <g transform="translate(65 121)" fill="none"
        stroke="#1f2328" strokeWidth="2" strokeLinejoin="round">
        <rect x="0" y="0" width="19" height="14" rx="2" fill="#fffaf0" />
        <path d="m1 2 8.5 7L18 2" />
      </g>
      <text x="94" y="135" className="actors-help-link">orders-team@demo.email</text>
      <text x="30" y="179" className="actors-help-chevron">⌄</text>
      <g transform="translate(63 174)"><ActorIcon /></g>
      <text x="84" y="179" className="actors-help-heading">Actors (3)</text>
      <circle cx="188" cy="174" r="9" fill="none" stroke="#9da5b2" />
      <text x="188" y="178" className="actors-help-question" textAnchor="middle">?</text>
      {actors.map((actor, index) => (
        <g key={actor.id}>
          <text x="121" y={212 + index * 34} className="actors-help-link">
            {actor.name}
          </text>
          <text
            x={[306, 306, 285][index]}
            y={211 + index * 34}
            className="actors-help-role"
          >
            {actor.role}
          </text>
        </g>
      ))}
    </g>
  );
}

export default function ActorsHelpDemo() {
  const [run, setRun] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [reduceMotion] = useState(() =>
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
  );

  useEffect(() => {
    if (reduceMotion) {
      setElapsed(previewTime);
      return undefined;
    }
    setElapsed(0);
    const start = performance.now();
    const timer = window.setInterval(() => {
      const next = Math.min(actorsHelpDuration, performance.now() - start);
      setElapsed(next);
      if (next >= actorsHelpDuration) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, [run, reduceMotion]);

  const frame = getActorsHelpFrame(elapsed);
  const finished = !reduceMotion && elapsed >= actorsHelpDuration;
  const illustrating = !reduceMotion && !finished &&
    (elapsed < 1800 || elapsed >= 10450);
  const moving = frame.travel;
  const figureStyle = { "--actors-help-progress": String(elapsed / actorsHelpDuration) } as CSSProperties;

  return (
    <figure
      className={"actors-help-demo" +
        (finished || reduceMotion ? " is-still" : "") +
        (illustrating ? " is-illustrating" : "")}
      aria-label="Actors become Item ownership and relationship entries"
      style={figureStyle}
    >
      <HelpAnimationProgress progress={elapsed / actorsHelpDuration} />
      <svg viewBox="0 0 640 326" className="actors-help-diagram"
        role="img" aria-label="Three people work with a service, become Owner, User, and Other rows on an Item page, then return"
      >
        <ItemPreview opacity={reduceMotion ? 1 : frame.pageOpacity} />
        {!reduceMotion && (
          <g data-service="item" opacity={frame.machineOpacity}
            transform={"translate(" +
              lerp(314, 65, moving) + " " +
              lerp(169, 40, moving) + ") scale(" +
              lerp(0.84, 0.10, moving) + ") translate(-94 -110)"}
          >
            <Machine />
          </g>
        )}
        {!reduceMotion && actors.map((actor) => {
          const x = lerp(actor.start[0], actor.destination[0], moving);
          const y = lerp(actor.start[1], actor.destination[1], moving);
          const scale = lerp(0.87, 0.23, moving);
          return (
            <g key={actor.id} data-actor={actor.id}
              opacity={frame.actorOpacity}
              transform={"translate(" + x + " " + y + ") scale(" + scale + ") translate(-50 -70)"}
            >
              <ActorCharacter actor={actor} />
            </g>
          );
        })}
      </svg>
      <figcaption className="actors-help-footer">
        <span>People and teams become Actors in the Item view.</span>
        {!reduceMotion && (
          <button type="button" onClick={() => setRun((value) => value + 1)}>
            Replay
          </button>
        )}
      </figcaption>
    </figure>
  );
}
