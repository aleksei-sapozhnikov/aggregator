import UnhealthySignalsHelpDemo from "./UnhealthySignalsHelpDemo";

export const unhealthySignalsHelp = {
  title: "Unhealthy signals",
  summary: "What's affecting this item's health right now.",
};

export default function UnhealthySignalsHelpContent() {
  return (
    <>
      <div className="info-help-description modal-text-flow">
        <p>
          <strong>See which checks need attention right now.</strong>
        </p>
        <p>The issue may be in this item or in a service it depends on. Affected services appear next to their checks, so you can open them for more details.</p>
      </div>
      <UnhealthySignalsHelpDemo />
    </>
  );
}
