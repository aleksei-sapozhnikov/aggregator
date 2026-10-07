/**
 * @file About dialog wrapper for static application description content.
 */

import AboutContent from "../AboutContent";
import CloseButton from "./CloseButton";

type AboutModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * Renders the About modal and delegates body content to `AboutContent`.
 *
 */
export default function AboutModal({ isOpen, onClose }: AboutModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="about-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="About Catalog Health Aggregator"
      onClick={onClose}
    >
      <article
        className="about-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <CloseButton ariaLabel="Close about page" onClick={onClose} />
        <AboutContent />
      </article>
    </div>
  );
}
