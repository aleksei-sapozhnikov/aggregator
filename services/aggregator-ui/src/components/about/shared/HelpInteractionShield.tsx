/** @file Prevents demo-only UI from responding to pointer interactions. */

import "./HelpInteractionShield.css";

export default function HelpInteractionShield() {
  return <div className="help-interaction-shield" aria-hidden="true" />;
}
