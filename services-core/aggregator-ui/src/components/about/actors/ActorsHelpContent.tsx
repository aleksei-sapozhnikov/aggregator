import ActorsHelpDemo from "./ActorsHelpDemo";

export const actorsHelp = {
  title: "Actors",
  summary: "People or teams associated with this item.",
};

export default function ActorsHelpContent() {
  return (
    <>
      <div className="info-help-description modal-text-flow">
        <p>
          Actors describe the people or teams associated with this item and
          their relationship to it. An actor can, for example, be an owner, a
          user, or another involved party. Actors can also provide contacts that
          help you reach the relevant people.
        </p>
      </div>
      <ActorsHelpDemo />
    </>
  );
}
