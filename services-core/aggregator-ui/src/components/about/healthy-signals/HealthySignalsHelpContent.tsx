import HealthySignalsHelpDemo from "./HealthySignalsHelpDemo";

export const healthySignalsHelp = {
  title: "Healthy signals",
  summary:
    "Signals on this item that are currently healthy.",
};

export default function HealthySignalsHelpContent() {
  return (
    <>
      <div className="info-help-description modal-text-flow">
        <p>
          Healthy signals are the selected item's own health signals that are
          currently passing. They are kept separate from unhealthy signals so
          the main view can focus on what is affecting the item while healthy
          evidence remains available when needed.
        </p>
      </div>
      <HealthySignalsHelpDemo />
    </>
  );
}
