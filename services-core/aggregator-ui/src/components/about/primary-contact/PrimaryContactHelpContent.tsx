import PrimaryContactHelpDemo from "./PrimaryContactHelpDemo";

export const primaryContactHelp = {
  title: "Primary contact",
  summary: "The main contact for this item.",
};

export default function PrimaryContactHelpContent() {
  return (
    <>
      <div className="info-help-description modal-text-flow">
        <p>
          The primary contact is the main contact point associated with this
          item. Use it when you need more information, need to reach the
          responsible people, or are not sure who to contact about the item.
        </p>
      </div>
      <PrimaryContactHelpDemo />
    </>
  );
}
