/** @file Prevents demo-only UI from responding to pointer interactions. */

import "./HelpInteractionShield.css";

/** Prevents animated demo elements from capturing pointer or touch events. */
export default function HelpInteractionShield() {
  return <div className="help-interaction-shield" aria-hidden="true" />;
}
