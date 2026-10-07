import type { CatalogContact } from "../shared/types";
import { resolveContactLabel } from "../shared/contactUtils";
import CloseButton from "./CloseButton";

type ContactModalProps = {
  isOpen: boolean;
  contact: CatalogContact | null;
  onClose: () => void;
};

export default function ContactModal({
  isOpen,
  contact,
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
        <CloseButton ariaLabel="Close contact details" onClick={onClose} />
        <header className="contact-modal-header">
          <h2>{resolveContactLabel(contact)}</h2>
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
