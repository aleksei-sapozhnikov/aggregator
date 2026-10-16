import UnhealthySignalsHelpDemo from "./UnhealthySignalsHelpDemo";

export const unhealthySignalsHelp = {
  title: "Unhealthy signals",
  summary: "Signals currently contributing to this item's unhealthy state. Click for details.",
};

export default function UnhealthySignalsHelpContent() {
  return (
    <>
      <div className="info-help-description modal-text-flow">
        <p>Unhealthy signals show what is currently affecting the health of this item. The list can include the item's own failing signals and failing signals coming from its dependencies. Dependencies are shown with their relevant signals so you can see where the problem originates and open the dependency for more detail.</p>
      </div>
      <UnhealthySignalsHelpDemo />
    </>
  );
}
