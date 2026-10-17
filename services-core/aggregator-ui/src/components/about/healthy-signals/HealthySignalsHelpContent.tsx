import HealthySignalsHelpDemo from "./HealthySignalsHelpDemo";

export const healthySignalsHelp = {
  title: "Healthy signals",
  summary: "Checks on this item that are currently passing.",
};

export default function HealthySignalsHelpContent() {
  return (
    <>
      <div className="info-help-description modal-text-flow">
        <p>
          <strong>These checks are working as expected.</strong>
        </p>
        <p>They belong to this item, not its dependencies. They're kept out of the way so problems are easier to spot.</p>
      </div>
      <HealthySignalsHelpDemo />
    </>
  );
}
