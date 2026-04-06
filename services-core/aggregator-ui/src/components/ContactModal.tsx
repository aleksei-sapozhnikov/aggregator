import type { CatalogContact } from "../shared/types";
import {
  resolveContactIconId,
  resolveContactLabel,
  resolveContactTypeClass,
  resolveContactTypeDisplayName,
} from "../shared/contactUtils";

type ContactModalProps = {
  isOpen: boolean;
  contact: CatalogContact | null;
  iconSpriteHref: string;
  onClose: () => void;
};

export default function ContactModal({
  isOpen,
  contact,
  iconSpriteHref,
  onClose,
}: ContactModalProps) {
  if (!isOpen || !contact) {
    return null;
  }

  const openedByLink = `/contacts/${contact.id}`;

  return (
    <div
      className="about-overlay contact-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Contact details"
      onClick={onClose}
    >
      <article
        className="about-modal contact-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="about-close"
          aria-label="Close contact details"
          onClick={onClose}
        >
          ×
        </button>
        <header className="contact-modal-header">
          <h2 className="contact-modal-title">
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
            <span>{resolveContactLabel(contact)}</span>
          </h2>
        </header>
        <div className="contact-modal-body">
          <p>
            This window was opened by a contact link defined in the catalog:{" "}
            <span className="contact-modal-link-preview">{openedByLink}</span>.
          </p>
          <p>
            In a real setup, the link could open a phonebook entry, Slack/Teams
            channel, on-call profile, or any other quick communication
            destination.
          </p>
        </div>
      </article>
    </div>
  );
}
