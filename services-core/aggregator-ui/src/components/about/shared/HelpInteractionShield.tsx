import "./HelpInteractionShield.css";

// Transparent overlay prevents demo elements from capturing mouse or touch events.
// Keep it behind the non-interactive progress indicator but above the SVG.
export default function HelpInteractionShield() {
  return <div className="help-interaction-shield" aria-hidden="true" />;
}
