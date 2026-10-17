/** @file Defines the Actors help summary, detailed explanation, and animated example. */

import ActorsHelpDemo from "./ActorsHelpDemo";

export const actorsHelp = {
  title: "Actors",
  summary: "People or teams involved with this item.",
};

export default function ActorsHelpContent() {
  return (
    <>
      <div className="info-help-description modal-text-flow">
        <p>
          <strong>{actorsHelp.summary}</strong>
        </p>
        <p>
          Some own it, some use it, and others support it. Open an actor to see
          their role and any available contact details.
        </p>
      </div>
      <ActorsHelpDemo />
    </>
  );
}
