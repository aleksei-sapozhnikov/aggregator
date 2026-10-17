import { useRef, useState } from "react";
import type { RefObject } from "react";
import ItemTitle from "../../shared/item/ItemTitle";
import ItemOwnership, {
  PrimaryContactRow,
} from "../../shared/item/ItemOwnership";
import HelpScene, { useHelpTargets, type SceneRect } from "../shared/HelpScene";
import DemoHelp from "../shared/DemoHelp";
import {
  demoIconSpriteHref,
  experienceItem,
  experienceContact,
  experienceActors,
} from "../shared/demoData";
import HelpAnimationProgress from "../shared/HelpAnimationProgress";
import HelpInteractionShield from "../shared/HelpInteractionShield";
import DemoHighlightFrame from "../shared/DemoHighlightFrame";
import DemoWoodLabel from "../shared/DemoWoodLabel";
import HelpAnimationCanvas from "../shared/HelpAnimationCanvas";
import useHelpAnimationClock from "../shared/useHelpAnimationClock";
import OwnerCharacter from "../shared/characters/OwnerCharacter";
import UserCharacter from "../shared/characters/UserCharacter";
import ServiceMachine from "../shared/characters/ServiceMachine";
import { progressBetween, smooth } from "../shared/signal-flow/progress";
import "./PrimaryContactHelpDemo.css";

// HTML and SVG share scene coordinates, while the page uses production components.
export const primaryContactHelpDuration = 15200;
const transition = (time: number, start: number, end: number) =>
  smooth(progressBetween(time, start, end));
const mix = (start: number, end: number, amount: number) =>
  start + (end - start) * amount;

export function getPrimaryContactHelpFrame(time: number) {
  const t =
    ((time % primaryContactHelpDuration) + primaryContactHelpDuration) %
    primaryContactHelpDuration;
  const contactTravel = transition(t, 6000, 7500);
  const technicianArrival = transition(t, 8350, 9600);
  const technicianDeparture = transition(t, 11600, 12700);
  return {
    unhealthy: transition(t, 1450, 1800) * (1 - transition(t, 11100, 11600)),
    alarm: transition(t, 1550, 1850) * (1 - transition(t, 2650, 3050)),
    laptop: transition(t, 2200, 3050) * (1 - transition(t, 12300, 13200)),
    pageExpansion: transition(t, 2950, 4250),
    pageOpacity: transition(t, 2850, 3250) * (1 - transition(t, 5900, 7050)),
    selectedContact:
      transition(t, 4650, 5200) * (1 - transition(t, 5950, 6400)),
    contactTravel,
    transferOpacity:
      transition(t, 5900, 6200) * (1 - transition(t, 7350, 7800)),
    phone: transition(t, 6250, 6900) * (1 - transition(t, 12100, 12800)),
    calling: transition(t, 7450, 7950) * (1 - transition(t, 8750, 9200)),
    technicianX: mix(
      mix(665, 238, technicianArrival),
      665,
      technicianDeparture,
    ),
    technicianOpacity:
      transition(t, 8250, 8800) * (1 - transition(t, 12200, 12800)),
    repair: transition(t, 9450, 9850) * (1 - transition(t, 10700, 11200)),
    wrenchAngle: Math.sin(t / 120) * 17,
  };
}

// Keep the illustrated service close to its desktop pixel size on narrower cards.
// The SVG viewport crops unused space rather than shrinking the entire scene.
export function getPrimaryContactHelpLayout(availableWidth: number) {
  const compact = availableWidth < 640;
  const width = compact ? Math.max(300, Math.min(640, availableWidth)) : 640;
  const height = compact ? Math.max(215, (width * 340) / 640) : 340;
  const left = compact ? 320 - width / 2 : 0;
  const top = compact ? 195 - height / 2 : 0;
  // Give the real UI a narrower layout before scaling so text stays readable.
  const pageWidth = compact ? 480 : 640;
  const pageHeight = 340;
  const pageScale = compact
    ? Math.min((width - 20) / pageWidth, (height - 18) / pageHeight)
    : 1;
  const pageX = compact ? left + (width - pageWidth * pageScale) / 2 : 0;
  const pageY = compact ? top + (height - pageHeight * pageScale) / 2 : 0;
  const observerShift = compact ? Math.max(0, 360 - width) * 0.6 : 0;

  return {
    compact,
    viewBox: [left, top, width, height].join(" "),
    pageScale,
    pageWidth,
    pageHeight,
    pageX,
    pageY,
    observerShift,
  };
}

type HelpFrame = ReturnType<typeof getPrimaryContactHelpFrame>;
type HelpLayout = ReturnType<typeof getPrimaryContactHelpLayout>;

function Laptop({ frame }: { frame: HelpFrame }) {
  return (
    <g
      data-primary-contact-laptop="true"
      style={{ opacity: Math.min(1, frame.laptop * 3) }}
      transform="translate(371 211)"
    >
      <rect
        x="4"
        y="48"
        width="114"
        height="9"
        rx="4"
        fill="#3d576d"
        stroke="#293d51"
        strokeWidth="2"
      />
      <g
        transform={
          "translate(0 " +
          48 * (1 - frame.laptop) +
          ") scale(1 " +
          frame.laptop +
          ")"
        }
      >
        <rect
          x="13"
          y="-8"
          width="97"
          height="55"
          rx="5"
          fill="#3b586f"
          stroke="#293d51"
          strokeWidth="3"
        />
        <rect x="19" y="-2" width="85" height="42" rx="3" fill="#dae6ef" />
        <text
          x="61"
          y="24"
          textAnchor="middle"
          className="primary-contact-laptop-word"
        >
          Aggregator
        </text>
      </g>
    </g>
  );
}

function Phone({ frame }: { frame: HelpFrame }) {
  return (
    <g data-primary-contact-phone="true" style={{ opacity: frame.phone }}>
      <path
        d="M447 213q13 14 23 9"
        fill="none"
        stroke="#4286c5"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <rect
        x="468"
        y="166"
        width="83"
        height="123"
        rx="12"
        fill="#304b62"
        stroke="#263c4d"
        strokeWidth="3"
      />
      <rect
        x="474"
        y="176"
        width="71"
        height="98"
        rx="5"
        className="primary-contact-phone-screen"
      />
      <rect x="497" y="170" width="23" height="3" rx="1.5" fill="#99afc0" />
      <text
        x="509"
        y="202"
        textAnchor="middle"
        className="primary-contact-phone-title"
      >
        Primary
      </text>
      <text
        x="509"
        y="216"
        textAnchor="middle"
        className="primary-contact-phone-title"
      >
        contact
      </text>
      <circle
        cx="509"
        cy="244"
        r="12"
        className="primary-contact-call-circle"
      />
      <path
        d="M501 242q6 11 15 5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <g
        style={{ opacity: frame.calling }}
        className="primary-contact-phone-waves"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <path d="M556 188q18 15 0 31M563 179q31 23 1 49" />
      </g>
    </g>
  );
}

function Technician({ frame }: { frame: HelpFrame }) {
  return (
    <g data-primary-contact-technician="true"
      style={{ opacity: frame.technicianOpacity }}
      transform={"translate(" + frame.technicianX + " 143)"}
    >
      <g transform="translate(-19 0) scale(1.15)">
        <OwnerCharacter repairProgress={frame.wrenchAngle * frame.repair} />
      </g>
      <g transform="translate(40 166) scale(1.8)">
        <DemoWoodLabel x={0} y={0} width={70} label="Owner" />
      </g>
    </g>
  );
}

function Observer({ frame }: { frame: HelpFrame }) {
  return (
    <g data-primary-contact-observer="true" transform="translate(352 76)">
      <g transform="translate(-5 -20) scale(1.6)">
        <UserCharacter />
      </g>
      <g transform="translate(75 211) scale(2.4)">
        <DemoWoodLabel x={0} y={0} width={62} label="User" />
      </g>
      <g data-primary-contact-alarm="true" opacity={frame.alarm}>
        <text x="117" y="2" className="primary-contact-exclamation">!</text>
        <path d="M116-7l-5-8M130-8l7-8"
          className="primary-contact-alarm-rays" strokeWidth="3" />
      </g>
    </g>
  );
}

const contactSelectors = { contact: ".primary-contact-row" };
const contactFallback = { contact: { x: 49, y: 90, width: 220, height: 34 } };

function AggregatorPage({
  frame,
  layout,
  pageRef,
  contactTarget,
}: {
  frame: HelpFrame;
  layout: HelpLayout;
  pageRef: RefObject<HTMLDivElement | null>;
  contactTarget: SceneRect;
}) {
  const scale = mix(0.1, layout.pageScale, frame.pageExpansion);
  const x = mix(392 - 320 * 0.1, layout.pageX, frame.pageExpansion);
  const y = mix(213 - 170 * 0.1, layout.pageY, frame.pageExpansion);
  return (
    <div
      ref={pageRef}
      data-primary-contact-page="true"
      inert
      aria-hidden="true"
      className="help-item-page primary-contact-page"
      style={{
        opacity: frame.pageOpacity,
        width: layout.pageWidth,
        minHeight: layout.pageHeight,
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
      }}
    >
      <ItemTitle
        item={experienceItem}
        firstWord="Customer"
        rest=" Experience"
        status="down"
        interactive={false}
      />
      <section className="details-summary-block">
        <ItemOwnership
          primaryContact={experienceContact}
          actorRows={experienceActors}
          expanded
          iconSpriteHref={demoIconSpriteHref}
          primaryHelp={<DemoHelp title="Primary contact" />}
          actorsHelp={<DemoHelp title="Actors" />}
        />
      </section>
      <DemoHighlightFrame
        mode="html"
        data-primary-contact-highlight="true"
        x={contactTarget.x - 4}
        y={contactTarget.y - 4}
        width={contactTarget.width + 8}
        height={contactTarget.height + 8}
        color="var(--link)"
        opacity={frame.selectedContact}
      />
    </div>
  );
}

function ContactTransfer({
  frame,
  layout,
  source,
}: {
  frame: HelpFrame;
  layout: HelpLayout;
  source: SceneRect;
}) {
  const x = mix(
    layout.pageX + source.x * layout.pageScale,
    441 - layout.observerShift,
    frame.contactTravel,
  );
  const y = mix(
    layout.pageY + source.y * layout.pageScale,
    220,
    frame.contactTravel,
  );
  const scale = mix(layout.pageScale, 0.19, frame.contactTravel);
  return (
    <div
      data-primary-contact-transfer="true"
      className="primary-contact-transfer"
      inert
      aria-hidden="true"
      style={{
        opacity: frame.transferOpacity,
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
      }}
    >
      <PrimaryContactRow
        contact={experienceContact}
        iconSpriteHref={demoIconSpriteHref}
      />
    </div>
  );
}

export default function PrimaryContactHelpDemo() {
  const pageRef = useRef<HTMLDivElement>(null);
  const targets = useHelpTargets(pageRef, contactSelectors, contactFallback);
  // Match the compact canvas at first paint; resize measurements take over.
  const [availableWidth, setAvailableWidth] = useState(540);
  const { elapsed, reduceMotion } = useHelpAnimationClock(
    primaryContactHelpDuration,
    5350,
  );

  const frame = getPrimaryContactHelpFrame(elapsed);
  const layout = getPrimaryContactHelpLayout(availableWidth);
  return (
    <HelpAnimationCanvas
      className="primary-contact-help-demo"
      ariaLabel="Find the primary contact in Aggregator to get a failing service repaired"
      maxWidth={560}
    >
      <HelpAnimationProgress
        progress={reduceMotion ? 0 : elapsed / primaryContactHelpDuration}
      />
      <HelpScene
        width={640}
        height={340}
        viewBox={layout.viewBox}
        onResize={setAvailableWidth}
      >
        <svg
          viewBox="0 0 640 340"
          className="primary-contact-help-diagram"
          role="img"
          aria-label="A service goes down; a person opens Aggregator on a laptop, finds the primary contact, calls the responsible technician, and the service is restored"
        >
          <g aria-hidden="true">
            <g
              data-primary-contact-scene="true"
              transform="translate(130 55) scale(0.66)"
            >
              <g data-primary-contact-service="true"
                transform="translate(75 113) scale(0.82)">
                <ServiceMachine unhealthy={frame.unhealthy} />
              </g>
              <g
                data-primary-contact-observer-offset="true"
                transform={
                  layout.observerShift
                    ? "translate(-" + layout.observerShift + " 0)"
                    : undefined
                }
              >
                <g
                  data-primary-contact-observer-scale="true"
                  transform="translate(379 140) scale(0.75) translate(-352 -76)"
                >
                  <Observer frame={frame} />
                  <Laptop frame={frame} />
                  <Phone frame={frame} />
                </g>
              </g>
              <Technician frame={frame} />
              <g
                data-primary-contact-repair="true"
                style={{ opacity: frame.repair }}
                className="primary-contact-repair-sparks"
                strokeWidth="3"
                strokeLinecap="round"
              >
                <path d="M248 212l16-9M253 225l18 3M249 237l13 11" />
              </g>
            </g>
          </g>
        </svg>
        <AggregatorPage
          frame={frame}
          layout={layout}
          pageRef={pageRef}
          contactTarget={targets.contact}
        />
        <ContactTransfer
          frame={frame}
          layout={layout}
          source={targets.contact}
        />
      </HelpScene>
      <HelpInteractionShield />
    </HelpAnimationCanvas>
  );
}
