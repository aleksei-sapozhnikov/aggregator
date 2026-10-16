import { useEffect, useRef, useState } from "react";
import HelpAnimationProgress from "./HelpAnimationProgress";
import "./PrimaryContactHelpDemo.css";

// All sprites and the expanding Item preview share one responsive SVG coordinate system.
export const primaryContactHelpDuration = 15200;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => value * value * (3 - 2 * value);
const transition = (time: number, start: number, end: number) =>
  ease(clamp((time - start) / (end - start)));
const mix = (start: number, end: number, amount: number) =>
  start + (end - start) * amount;

export function getPrimaryContactHelpFrame(time: number) {
  const t = ((time % primaryContactHelpDuration) + primaryContactHelpDuration) %
    primaryContactHelpDuration;
  const contactTravel = transition(t, 6000, 7500);
  const technicianArrival = transition(t, 8350, 9600);
  const technicianDeparture = transition(t, 11600, 12700);
  return {
    unhealthy: transition(t, 1450, 1800) *
      (1 - transition(t, 11100, 11600)),
    alarm: transition(t, 1550, 1850) *
      (1 - transition(t, 2650, 3050)),
    laptop: transition(t, 2200, 3050) *
      (1 - transition(t, 12300, 13200)),
    pageExpansion: transition(t, 2950, 4250),
    pageOpacity: transition(t, 2850, 3250) *
      (1 - transition(t, 5900, 7050)),
    selectedContact: transition(t, 4650, 5200) *
      (1 - transition(t, 5950, 6400)),
    contactTravel,
    transferOpacity: transition(t, 5900, 6200) *
      (1 - transition(t, 7350, 7800)),
    phone: transition(t, 6250, 6900) *
      (1 - transition(t, 12100, 12800)),
    calling: transition(t, 7450, 7950) *
      (1 - transition(t, 8750, 9200)),
    technicianX: mix(mix(665, 238, technicianArrival), 665, technicianDeparture),
    technicianOpacity: transition(t, 8250, 8800) *
      (1 - transition(t, 12200, 12800)),
    repair: transition(t, 9450, 9850) *
      (1 - transition(t, 10700, 11200)),
    wrenchAngle: Math.sin(t / 120) * 17,
  };
}

// Keep the illustrated service close to its desktop pixel size on narrower cards.
// The SVG viewport crops unused space rather than shrinking the entire scene.
export function getPrimaryContactHelpLayout(availableWidth: number) {
  const compact = availableWidth < 640;
  const width = compact ? Math.max(300, Math.min(640, availableWidth)) : 640;
  const height = compact ? Math.max(215, width * 340 / 640) : 340;
  const left = compact ? 320 - width / 2 : 0;
  const top = compact ? 195 - height / 2 : 0;
  const pageScale = compact
    ? Math.min((width - 20) / 628, (height - 18) / 330)
    : 1;
  const pageX = compact ? left + 10 - 6 * pageScale : 0;
  const pageY = compact
    ? top + (height - 330 * pageScale) / 2 - 5 * pageScale
    : 0;
  const observerShift = compact ? Math.max(0, 360 - width) * 0.6 : 0;

  return {
    compact,
    viewBox: [left, top, width, height].join(" "),
    pageScale,
    pageX,
    pageY,
    observerShift,
  };
}

type HelpFrame = ReturnType<typeof getPrimaryContactHelpFrame>;
type HelpLayout = ReturnType<typeof getPrimaryContactHelpLayout>;

function Service({ frame }: { frame: HelpFrame }) {
  const healthyOpacity = 1 - frame.unhealthy;
  return (
    <g data-primary-contact-service="true" transform="translate(75 123)">
      <ellipse cx="89" cy="181" rx="89" ry="8" className="primary-contact-shadow" />
      <path d="M140 37l16-10q9-4 9 9v130l-20 11Z"
        fill="#587d98" stroke="#354e63" strokeWidth="3" />
      <rect x="14" y="28" width="137" height="149" rx="15"
        fill="#87a9c1" stroke="#354e63" strokeWidth="4" />
      <rect x="31" y="61" width="102" height="87" rx="11"
        fill="#334d64" stroke="#31485b" strokeWidth="3" />
      <g transform="translate(82 104)" fill="#98bace" stroke="#31485b" strokeWidth="2.7">
        {Array.from({ length: 8 }, (_, index) => (
          <rect key={index} x="-5" y="-34" width="10" height="16" rx="2"
            transform={"rotate(" + index * 45 + ")"} />
        ))}
        <circle r="24" />
        <circle r="10" fill="#516f86" />
      </g>
      <circle cx="22" cy="77" r="4.5" className="primary-contact-up-light" />
      <circle cx="22" cy="96" r="4.5" fill="#f6ca69" />
      <circle cx="22" cy="115" r="3.5" fill="#edaa79" />
      <rect x="50" y="159" width="61" height="7" rx="3.5" fill="#52758f" />
      <rect x="60" y="5" width="65" height="26" rx="5"
        fill="#52758f" stroke="#354e63" strokeWidth="3" />
      <rect x="82" y="-7" width="23" height="17" rx="5" stroke="#354e63"
        strokeWidth="3" className="primary-contact-up-light"
        style={{ opacity: healthyOpacity }} />
      <rect x="82" y="-7" width="23" height="17" rx="5" stroke="#9c3733"
        strokeWidth="3" className="primary-contact-down-light"
        style={{ opacity: frame.unhealthy }} />
      <g opacity={healthyOpacity} className="primary-contact-up-rays"
        strokeWidth="3" strokeLinecap="round">
        <path d="M87-15l-6-8M104-15l6-8M94-18v-9" />
      </g>
      <g opacity={frame.unhealthy} className="primary-contact-down-rays"
        strokeWidth="3" strokeLinecap="round">
        <path d="M87-15l-6-8M104-15l6-8M94-18v-9" />
      </g>
    </g>
  );
}

function Observer({ frame }: { frame: HelpFrame }) {
  return (
    <g data-primary-contact-observer="true" transform="translate(352 76)"
      strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="73" cy="230" rx="55" ry="7" className="primary-contact-shadow" />
      <path d="M42 168 33 228h28l13-50 11 50h27l-8-68Z"
        fill="#35495e" stroke="#283b4d" strokeWidth="3" />
      <path d="M28 101q2-20 29-21h35q25 4 28 23l-7 74H33Z"
        fill="#4286c5" stroke="#2b455b" strokeWidth="3" />
      <path d="M32 110 20 148 44 164M113 107l15 37-19 23"
        fill="none" stroke="#4286c5" strokeWidth="15" />
      <circle cx="44" cy="164" r="7" fill="#f6c49d" />
      <circle cx="109" cy="167" r="7" fill="#f6c49d" />
      <rect x="66" y="70" width="17" height="16" rx="4" fill="#f6c49d" />
      <ellipse cx="75" cy="48" rx="32" ry="35"
        fill="#f6c49d" stroke="#293e4f" strokeWidth="3" />
      <path d="M43 48q-9-33 22-38Q109 4 107 38l-16-10Q65 22 43 48Z"
        fill="#323a46" stroke="#293e4f" strokeWidth="3" />
      <circle cx="64" cy="49" r="2.5" fill="#263745" />
      <circle cx="88" cy="49" r="2.5" fill="#263745" />
      <path d={frame.unhealthy > 0.5
        ? "M65 68Q76 61 87 68" : "M64 64Q76 73 88 63"}
        fill="none" stroke="#263745" strokeWidth="2.5" />
      <g data-primary-contact-alarm="true" opacity={frame.alarm}>
        <text x="118" y="2" className="primary-contact-exclamation">!</text>
        <path d="M116-7l-5-8M130-8l7-8" className="primary-contact-alarm-rays"
          strokeWidth="3" />
      </g>
    </g>
  );
}

function Laptop({ frame }: { frame: HelpFrame }) {
  return (
    <g data-primary-contact-laptop="true"
      style={{ opacity: Math.min(1, frame.laptop * 3) }}
      transform="translate(371 211)">
      <rect x="4" y="48" width="114" height="9" rx="4"
        fill="#3d576d" stroke="#293d51" strokeWidth="2" />
      <g transform={"translate(0 " + (48 * (1 - frame.laptop)) +
        ") scale(1 " + frame.laptop + ")"}>
        <rect x="13" y="-8" width="97" height="55" rx="5"
          fill="#3b586f" stroke="#293d51" strokeWidth="3" />
        <rect x="19" y="-2" width="85" height="42" rx="3" fill="#dae6ef" />
        <text x="61" y="24" textAnchor="middle" className="primary-contact-laptop-word">
          Aggregator
        </text>
      </g>
    </g>
  );
}

function Phone({ frame }: { frame: HelpFrame }) {
  return (
    <g data-primary-contact-phone="true" style={{ opacity: frame.phone }}>
      <path d="M447 213q13 14 23 9" fill="none" stroke="#4286c5"
        strokeWidth="13" strokeLinecap="round" />
      <rect x="468" y="166" width="83" height="123" rx="12"
        fill="#304b62" stroke="#263c4d" strokeWidth="3" />
      <rect x="474" y="176" width="71" height="98" rx="5"
        className="primary-contact-phone-screen" />
      <rect x="497" y="170" width="23" height="3" rx="1.5" fill="#99afc0" />
      <text x="509" y="202" textAnchor="middle"
        className="primary-contact-phone-title">Primary</text>
      <text x="509" y="216" textAnchor="middle"
        className="primary-contact-phone-title">contact</text>
      <circle cx="509" cy="244" r="12" className="primary-contact-call-circle" />
      <path d="M501 242q6 11 15 5" fill="none" stroke="#ffffff"
        strokeWidth="3.5" strokeLinecap="round" />
      <g style={{ opacity: frame.calling }} className="primary-contact-phone-waves"
        fill="none" strokeWidth="3" strokeLinecap="round">
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
      strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="36" cy="159" rx="42" ry="6" className="primary-contact-shadow" />
      <path d="M15 106 9 155h19l14-43 10 43h20l-6-55Z"
        fill="#324e61" stroke="#284354" strokeWidth="2.5" />
      <path d="M3 68q9-14 25-14h27q20 4 23 20l-7 44H5Z"
        fill="#54b792" stroke="#286751" strokeWidth="3" />
      <circle cx="39" cy="27" r="25" fill="#f5bc91" stroke="#304455"
        strokeWidth="2.5" />
      <path d="M16 29Q12 0 41 0Q66 0 64 29L55 16Q39 7 16 29Z"
        fill="#a46b4d" stroke="#304455" strokeWidth="2" />
      <circle cx="31" cy="28" r="2" fill="#304455" />
      <circle cx="48" cy="28" r="2" fill="#304455" />
      <path d="M32 41q8 7 14-1" fill="none" stroke="#304455" strokeWidth="2" />
      <path d="M6 77 -3 94 20 103" fill="none" stroke="#54b792"
        strokeWidth="12" />
      <circle cx="20" cy="103" r="6" fill="#f5bc91" />
      <path d="M66 75 79 107" stroke="#54b792" strokeWidth="12" />
      <g data-primary-contact-wrench="true"
        transform={"rotate(" + frame.wrenchAngle * frame.repair + " 20 103)"}>
        <path d="M20 103 -13 75" stroke="#64798b" strokeWidth="8" />
        <path d="M-22 58q-10 3-6 15l10 4q11-2 10-12l-7 5-6-5Z"
          fill="#a8b9c7" stroke="#41596b" strokeWidth="2" />
        <circle cx="20" cy="103" r="5" fill="#a8b9c7" stroke="#41596b"
          strokeWidth="2" />
      </g>
      <circle cx="20" cy="103" r="5.5" fill="#f5bc91" />
    </g>
  );
}

function AggregatorPage({ frame, layout }: { frame: HelpFrame; layout: HelpLayout }) {
  // The same Item page expands from the laptop to fit the available viewport.
  const scale = mix(0.1, layout.pageScale, frame.pageExpansion);
  const x = mix(392 - 320 * 0.1, layout.pageX, frame.pageExpansion);
  const y = mix(213 - 170 * 0.1, layout.pageY, frame.pageExpansion);
  return (
    <g data-primary-contact-page="true"
      style={{ opacity: frame.pageOpacity }}
      transform={"translate(" + x + " " + y + ") scale(" + scale + ")"}>
      <rect x="6" y="5" width="628" height="330" rx="12"
        className="primary-contact-page-surface" />
      <text x="45" y="59" className="primary-contact-page-title">
        Customer Experience
      </text>
      <circle cx="29" cy="49" r="6" className="primary-contact-down-light" />
      <text x="490" y="58" className="primary-contact-page-down">DOWN</text>
      <path d="M28 77h584" className="primary-contact-page-separator" />
      <path d="M49 100v71" className="primary-contact-page-accent" />
      <text x="77" y="116" className="primary-contact-page-heading">
        Primary contact
      </text>
      <circle cx="251" cy="108" r="10" className="primary-contact-page-help-circle" />
      <text x="251" y="113" textAnchor="middle"
        className="primary-contact-page-help-text">?</text>
      <rect x="78" y="125" width="254" height="39" rx="7"
        className="primary-contact-page-highlight"
        style={{ opacity: frame.selectedContact }} />
      <g transform="translate(91 133)" className="primary-contact-page-icon"
        fill="none" strokeWidth="2.7" strokeLinecap="round">
        <path d="M2 1q-4 13 15 23l7-7-8-6-5 5-5-8 5-4Z" />
      </g>
      <text x="131" y="152" className="primary-contact-page-link">
        +1 555 010 2026
      </text>
      <path d="M49 187h537" className="primary-contact-page-separator" />
      <text x="78" y="218" className="primary-contact-page-muted">
        Actors (3)
      </text>
      <text x="78" y="246" className="primary-contact-page-link">
        Experience Ownership Team
      </text>
      <text x="429" y="246" className="primary-contact-page-muted">
        Owner
      </text>
    </g>
  );
}

function ContactTransfer({ frame, layout }: { frame: HelpFrame; layout: HelpLayout }) {
  // Keep the highlighted contact aligned with its page row and phone at any width.
  const x = mix(layout.pageX + 78 * layout.pageScale,
    441 - layout.observerShift, frame.contactTravel);
  const y = mix(layout.pageY + 125 * layout.pageScale, 220, frame.contactTravel);
  const scale = mix(layout.pageScale, 0.19, frame.contactTravel);
  return (
    <g data-primary-contact-transfer="true"
      style={{ opacity: frame.transferOpacity }}
      transform={"translate(" + x + " " + y + ") scale(" + scale + ")"}>
      <rect width="250" height="42" rx="7"
        className="primary-contact-page-highlight" />
      <text x="17" y="27" className="primary-contact-page-link">
        +1 555 010 2026
      </text>
    </g>
  );
}

export default function PrimaryContactHelpDemo() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(640);
  const [reduceMotion] = useState(() =>
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  const [elapsed, setElapsed] = useState(reduceMotion ? 5350 : 0);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const timer = window.setInterval(() => {
      setElapsed((current) => (current + 50) % primaryContactHelpDuration);
    }, 50);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    const measure = () => {
      const width = svg.getBoundingClientRect().width;
      if (width > 0) {
        setAvailableWidth((current) => Math.abs(current - width) < 0.5 ? current : width);
      }
    };
    measure();

    // Observing the SVG works even when the modal changes width without a
    // window resize, e.g. on rotation or a split-screen layout.
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(svg);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const frame = getPrimaryContactHelpFrame(elapsed);
  const layout = getPrimaryContactHelpLayout(availableWidth);
  return (
    <figure className="primary-contact-help-demo"
      aria-label="Find the primary contact in Aggregator to get a failing service repaired">
      <HelpAnimationProgress progress={reduceMotion ? 0 : elapsed / primaryContactHelpDuration} />
      <svg ref={svgRef} viewBox={layout.viewBox} className="primary-contact-help-diagram"
        role="img" aria-label="A service goes down; a person opens Aggregator on a laptop, finds the primary contact, calls the responsible technician, and the service is restored">
        <g aria-hidden="true">
          <g data-primary-contact-scene="true"
            transform="translate(130 55) scale(0.66)">
            <Service frame={frame} />
            <g data-primary-contact-observer-offset="true"
              transform={layout.observerShift
                ? "translate(-" + layout.observerShift + " 0)" : undefined}>
              <g data-primary-contact-observer-scale="true"
                transform="translate(379 140) scale(0.75) translate(-352 -76)">
                <Observer frame={frame} />
                <Laptop frame={frame} />
                <Phone frame={frame} />
              </g>
            </g>
            <Technician frame={frame} />
            <g data-primary-contact-repair="true" style={{ opacity: frame.repair }}
              className="primary-contact-repair-sparks" strokeWidth="3"
              strokeLinecap="round">
              <path d="M248 212l16-9M253 225l18 3M249 237l13 11" />
            </g>
          </g>
          <AggregatorPage frame={frame} layout={layout} />
          <ContactTransfer frame={frame} layout={layout} />
        </g>
      </svg>
    </figure>
  );
}
