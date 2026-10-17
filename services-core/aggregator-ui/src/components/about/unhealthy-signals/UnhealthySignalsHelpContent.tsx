/** @file Defines the Unhealthy signals topic summary and illustrated explanation. */

import UnhealthySignalsHelpDemo from "./UnhealthySignalsHelpDemo";

export const unhealthySignalsHelp = {
  title: "Unhealthy signals",
  summary: "See which checks need attention right now.",
};

/** Renders the help summary, explanation, and failing-signal animation. */
export default function UnhealthySignalsHelpContent() {
  return (
    <>
      <div className="info-help-description modal-text-flow">
        <p>
          <strong>{unhealthySignalsHelp.summary}</strong>
        </p>
        <p>
          The issue may be in this item or in a service it depends on. Affected
          services appear next to their checks, so you can open them for more
          details.
        </p>
      </div>
      <UnhealthySignalsHelpDemo />
    </>
  );
}
