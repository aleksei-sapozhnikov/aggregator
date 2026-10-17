/** @file Presents a catalog actor's description and contact channels in a dialog. */

import {
  resolveContactIconId,
  resolveContactLabel,
  resolveContactTypeClass,
  resolveContactTypeDisplayName,
} from "../../../shared/contacts/contactPresentation";
import type { CatalogActor, CatalogContact } from "../../../shared/types";
import ModalWindow from "../../shared/ui/ModalWindow";
import ModalDetailsTrigger from "../../shared/ui/ModalDetailsTrigger";
import SecondaryLabel from "../../shared/ui/SecondaryLabel";

const resolveActorLabel = (actor?: CatalogActor | null): string => {
  if (!actor) {
    return "Unknown actor";
  }
  const title = String(actor.title || "").trim();
  if (title) {
    return title;
  }
  return actor.id;
};

type ActorModalProps = {
  isOpen: boolean;
  actor: CatalogActor | null;
  contacts: CatalogContact[];
  primaryContact: CatalogContact | null;
  iconSpriteHref: string;
  onClose: () => void;
  onOpenContact: (contact: CatalogContact) => void;
};

export default function ActorModal({
  isOpen,
  actor,
  contacts,
  primaryContact,
  iconSpriteHref,
  onClose,
  onOpenContact,
}: ActorModalProps) {
  if (!isOpen || !actor) {
    return null;
  }

  const orderedContacts = contacts;
  const descriptionParagraphs = String(actor.description || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => Boolean(line));

  return (
    <ModalWindow
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Actor details"
      closeLabel="Close actor details"
      header={<h2>{resolveActorLabel(actor)}</h2>}
    >
      <div className="actor-modal">
        <div className="actor-modal-body">
          {descriptionParagraphs.length > 0 && (
            <div className="actor-modal-description modal-text-flow">
              {descriptionParagraphs.map((paragraph, index) => (
                <p key={`${actor.id}-desc-${index}`}>{paragraph}</p>
              ))}
            </div>
          )}
          <h3 className="actor-modal-subtitle">Contacts</h3>
          {orderedContacts.length > 0 ? (
            <ul className="actor-modal-contacts">
              {orderedContacts.map((contact) => (
                <li key={contact.id} className="actor-modal-contact-row">
                  <ModalDetailsTrigger
                    className="actor-modal-contact-trigger"
                    onClick={() => onOpenContact(contact)}
                    title={resolveContactLabel(contact)}
                  >
                    <span
                      className="actor-modal-contact-icon"
                      title={resolveContactTypeDisplayName(contact.type)}
                      aria-hidden="true"
                    >
                      <svg
                        className={`contact-type-icon ${resolveContactTypeClass(contact.type)}`}
                        viewBox="0 0 24 24"
                        focusable="false"
                      >
                        <use
                          href={`${iconSpriteHref}#${resolveContactIconId(contact.type)}`}
                        />
                      </svg>
                    </span>
                    <span className="actor-modal-contact-name">
                      {resolveContactLabel(contact)}
                    </span>
                  </ModalDetailsTrigger>
                  {primaryContact?.id === contact.id && (
                    <SecondaryLabel text="Primary" />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>No contacts linked to this actor.</p>
          )}
        </div>
      </div>
    </ModalWindow>
  );
}
