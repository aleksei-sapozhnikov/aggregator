import type { CatalogActor, CatalogContact } from "../shared/types";
import { isPlainLeftClick } from "../shared/catalogUtils";
import {
  resolveContactIconId,
  resolveContactLabel,
  resolveContactTypeClass,
  resolveContactTypeDisplayName,
} from "../shared/contactUtils";

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
        <button
          type="button"
          className="about-close"
          aria-label="Close actor details"
          onClick={onClose}
        >
          ×
        </button>
        <header className="actor-modal-header">
          <h2 className="actor-modal-title">
            <span className="actor-team-icon-wrap" aria-hidden="true">
              <svg
                className="actor-team-icon"
                viewBox="0 0 24 24"
                focusable="false"
              >
                <use href={`${iconSpriteHref}#icon-actor`} />
              </svg>
            </span>
            <span>{resolveActorLabel(actor)}</span>
          </h2>
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
                    className="contact-chip actor-modal-contact-chip"
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
                      className="contact-type-icon-wrap"
                      title={resolveContactTypeDisplayName(contact.type)}
                      aria-label={resolveContactTypeDisplayName(contact.type)}
                    >
                      <svg
                        className={`contact-type-icon ${resolveContactTypeClass(contact.type)}`}
                        viewBox="0 0 24 24"
                        focusable="false"
                        aria-hidden="true"
                      >
                        <use
                          href={`${iconSpriteHref}#${resolveContactIconId(contact.type)}`}
                        />
                      </svg>
                    </span>
                    <span className="actor-modal-contact-main">
                      {primaryContact?.id === contact.id && (
                        <span className="actor-modal-contact-prefix">
                          Primary
                        </span>
                      )}
                      <span className="contact-chip-text">
                        {resolveContactLabel(contact)}
                      </span>
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
