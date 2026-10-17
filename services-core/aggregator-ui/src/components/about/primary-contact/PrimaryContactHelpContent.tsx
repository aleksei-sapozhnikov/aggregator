import PrimaryContactHelpDemo from "./PrimaryContactHelpDemo";

export const primaryContactHelp = {
  title: "Primary contact",
  summary: "This is who to contact first about this item.",
};

export default function PrimaryContactHelpContent() {
  return (
    <>
      <div className="info-help-description modal-text-flow">
        <p>
          <strong>{primaryContactHelp.summary}</strong>
        </p>
        <p>Use the contact details to ask a question or report a problem. You don't need to know which team handles it.</p>
      </div>
      <PrimaryContactHelpDemo />
    </>
  );
}
