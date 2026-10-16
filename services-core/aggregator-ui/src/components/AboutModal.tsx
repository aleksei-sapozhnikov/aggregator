/**
 * @file About dialog wrapper for static application description content.
 */

import AboutContent, { AboutHeader } from "../AboutContent";
import ModalWindow from "./shared/ui/ModalWindow";

type AboutModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * Renders the About modal and delegates body content to `AboutContent`.
 *
 */
export default function AboutModal({ isOpen, onClose }: AboutModalProps) {
  return (
    <ModalWindow
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="About Catalog Health Aggregator"
      closeLabel="Close about page"
      header={<AboutHeader />}
    >
      <AboutContent />
    </ModalWindow>
  );
}
