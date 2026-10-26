import {
  resolveContactIconId,
  resolveContactLabel,
  resolveContactTypeClass,
  resolveContactTypeDisplayName,
} from "../shared/contactUtils";
import type { CatalogActor, CatalogContact } from "../shared/types";
import { isPlainLeftClick } from "../shared/catalogUtils";
import CloseButton from "./CloseButton";

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
  iconSpriteHref: string;
  onClose: () => void;
  onOpenContact: (contact: CatalogContact) => void;
};

export default function ActorModal({
  isOpen,
  actor,
  contacts,
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
    <div
      className="about-overlay actor-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Actor details"
      onClick={onClose}
    >
      <article
        className="about-modal actor-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <CloseButton ariaLabel="Close actor details" onClick={onClose} />
        <header className="actor-modal-header">
          <h2>{resolveActorLabel(actor)}</h2>
        </header>
        <div className="actor-modal-body">
          {descriptionParagraphs.length > 0 && (
            <div className="actor-modal-description">
              {descriptionParagraphs.map((paragraph, index) => (
                <p key={`${actor.id}-desc-${index}`}>{paragraph}</p>
              ))}
            </div>
          )}
          <h3 className="actor-modal-subtitle">Contacts</h3>
          {orderedContacts.length > 0 ? (
            <ul className="actor-modal-contacts">
              {orderedContacts.map((contact) => (
                <li key={contact.id}>
                  <a
                    className="details-text-link actor-modal-contact-link"
                    href={`/contacts/${contact.id}`}
                    onClick={(event) => {
                      if (!isPlainLeftClick(event)) {
                        return;
                      }
                      event.preventDefault();
                      onOpenContact(contact);
                    }}
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
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p>No contacts linked to this actor.</p>
          )}
        </div>
      </article>
    </div>
  );
}
