/** @file Presents the application introduction in the shared modal shell. */

import AboutContent, { AboutHeader } from "./AboutContent";
import ModalWindow from "../../shared/ui/ModalWindow";

type AboutModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

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
