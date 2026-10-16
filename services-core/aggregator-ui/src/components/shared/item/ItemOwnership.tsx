import type { ReactNode } from "react";
import type { CatalogActor, CatalogContact } from "../../../shared/types";
import {
  resolveContactIconId, resolveContactLabel, resolveContactTypeClass,
  resolveContactTypeDisplayName,
} from "../../../shared/contactUtils";
import DetailsDisclosureHeader from "./DetailsDisclosureHeader";
import ModalDetailsTrigger from "../ui/ModalDetailsTrigger";
import SecondaryLabel from "../ui/SecondaryLabel";

export type ActorSummaryRow = { key: string; actor: CatalogActor; typeLabel: string };

type ContactProps = {
  contact: CatalogContact;
  iconSpriteHref: string;
  onOpenContact?: (contact: CatalogContact) => void;
};

export function PrimaryContactRow({ contact, iconSpriteHref, onOpenContact }: ContactProps) {
  const typeName = resolveContactTypeDisplayName(contact.type);
  return (
    <div className="primary-contact-row">
      <span className="primary-contact-icon">
        <span className="contact-type-icon-wrap" title={typeName} aria-label={typeName}>
          <svg className={`contact-type-icon ${resolveContactTypeClass(contact.type)}`}
            viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <use href={`${iconSpriteHref}#${resolveContactIconId(contact.type)}`} />
          </svg>
        </span>
      </span>
      <ModalDetailsTrigger className="primary-contact-link" title={resolveContactLabel(contact)}
        onClick={onOpenContact ? () => onOpenContact(contact) : undefined}>
        {resolveContactLabel(contact)}
      </ModalDetailsTrigger>
    </div>
  );
}

export function PrimaryContact({ help, ...props }: ContactProps & { help?: ReactNode }) {
  return (
    <div className="ownership-contact-section">
      <div className="primary-contact-block" aria-label="Primary contact">
        <div className="primary-contact-heading-row">
          <div className="primary-contact-heading">Primary contact</div>
          {help}
        </div>
        <PrimaryContactRow {...props} />
      </div>
    </div>
  );
}

export function ActorsSection({ rows, expanded, onToggle, onOpenActor, iconSpriteHref, help }: {
  rows: ActorSummaryRow[];
  expanded: boolean;
  onToggle?: () => void;
  onOpenActor?: (actor: CatalogActor) => void;
  iconSpriteHref: string;
  help?: ReactNode;
}) {
  return (
    <div className="ownership-actors-group">
      <DetailsDisclosureHeader label={`Actors (${rows.length})`} toggleLabel="Toggle Actors"
        expanded={expanded} onToggle={onToggle} help={help}
        icon={
          <span className="details-disclosure-icon" aria-hidden="true">
            <span className="actor-team-icon-wrap" aria-hidden="true">
              <svg className="actor-team-icon" viewBox="0 0 24 24" focusable="false">
                <use href={`${iconSpriteHref}#icon-actor`} />
              </svg>
            </span>
          </span>
        } />
      <div className={`disclosure-panel ownership-extra-contacts ${expanded ? "is-open" : ""}`}>
        <ul className="ownership-extra-list">
          {rows.map((entry) => (
            <li key={entry.key}>
              <div className="actor-summary-row">
                <ModalDetailsTrigger className="actor-summary-name" title={entry.actor.title || entry.actor.id}
                  onClick={onOpenActor ? () => onOpenActor(entry.actor) : undefined}>
                  {entry.actor.title || entry.actor.id}
                </ModalDetailsTrigger>
                <SecondaryLabel text={entry.typeLabel} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function ItemOwnership({
  primaryContact, actorRows, expanded, onToggleActors, onOpenContact, onOpenActor,
  iconSpriteHref, primaryHelp, actorsHelp,
}: {
  primaryContact: CatalogContact | null;
  actorRows: ActorSummaryRow[];
  expanded: boolean;
  onToggleActors?: () => void;
  onOpenContact?: (contact: CatalogContact) => void;
  onOpenActor?: (actor: CatalogActor) => void;
  iconSpriteHref: string;
  primaryHelp?: ReactNode;
  actorsHelp?: ReactNode;
}) {
  return (
    <div className="ownership-summary" role="group" aria-label="Ownership">
      {primaryContact && <PrimaryContact contact={primaryContact} iconSpriteHref={iconSpriteHref}
        onOpenContact={onOpenContact} help={primaryHelp} />}
      {actorRows.length > 0 && <ActorsSection rows={actorRows} expanded={expanded}
        onToggle={onToggleActors} onOpenActor={onOpenActor} iconSpriteHref={iconSpriteHref} help={actorsHelp} />}
    </div>
  );
}
