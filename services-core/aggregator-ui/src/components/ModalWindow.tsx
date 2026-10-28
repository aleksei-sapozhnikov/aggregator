import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import CloseButton from "./CloseButton";

type ModalWindowProps = {
  isOpen: boolean;
  onClose: () => void;
  ariaLabel: string;
  closeLabel?: string;
  children: ReactNode;
};

const stackChangeEventName = "aggregator-modal-stack-change";
let nextModalId = 1;
const openModalIds: number[] = [];

const notifyStackChanged = () => {
  window.dispatchEvent(new Event(stackChangeEventName));
};

const removeModalId = (id: number) => {
  const index = openModalIds.indexOf(id);
  if (index >= 0) {
    openModalIds.splice(index, 1);
    notifyStackChanged();
  }
};

const getStackIndex = (id: number): number => openModalIds.indexOf(id);

const isTopmostModal = (id: number): boolean =>
  openModalIds[openModalIds.length - 1] === id;

export default function ModalWindow({
  isOpen,
  onClose,
  ariaLabel,
  closeLabel = "Close dialog",
  children,
}: ModalWindowProps) {
  const idRef = useRef<number>(0);
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [stackIndex, setStackIndex] = useState(-1);

  if (idRef.current === 0) {
    idRef.current = nextModalId;
    nextModalId += 1;
  }

  const modalId = idRef.current;
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    if (!openModalIds.includes(modalId)) {
      openModalIds.push(modalId);
      notifyStackChanged();
    }

    const syncStackIndex = () => {
      setStackIndex(getStackIndex(modalId));
    };

    syncStackIndex();
    window.addEventListener(stackChangeEventName, syncStackIndex);
    window.setTimeout(() => {
      dialogRef.current?.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.removeEventListener(stackChangeEventName, syncStackIndex);
      removeModalId(modalId);
      previousFocusRef.current?.focus({ preventScroll: true });
      previousFocusRef.current = null;
    };
  }, [isOpen, modalId]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isTopmostModal(modalId)) {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, modalId, onClose]);

  if (!isOpen) {
    return null;
  }

  const zIndex = 80 + Math.max(stackIndex, 0) * 10;

  return createPortal(
    <div
      className="modal-overlay"
      style={{ zIndex }}
      onClick={(event) => {
        if (event.target === event.currentTarget && isTopmostModal(modalId)) {
          onClose();
        }
      }}
    >
      <article
        ref={dialogRef}
        className="modal-window"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        <CloseButton ariaLabel={closeLabel} onClick={onClose} />
        <div className="modal-content">{children}</div>
      </article>
    </div>,
    document.body,
  );
}
