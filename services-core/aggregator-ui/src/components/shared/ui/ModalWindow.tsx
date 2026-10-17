/** @file Provides focus-safe, stacked modal layout and keyboard handling. */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import CloseButton from "./CloseButton";

type ModalWindowProps = {
  isOpen: boolean;
  onClose: () => void;
  ariaLabel: string;
  closeLabel?: string;
  header?: ReactNode;
  children: ReactNode;
};

const stackChangeEventName = "aggregator-modal-stack-change";
let nextModalId = 1;
const openModalIds: number[] = [];

/** Notifies open dialogs that their stacking order may have changed. */
const notifyStackChanged = () => {
  window.dispatchEvent(new Event(stackChangeEventName));
};

/** Removes a dialog from the current modal stack. */
const removeModalId = (id: number) => {
  const index = openModalIds.indexOf(id);
  if (index >= 0) {
    openModalIds.splice(index, 1);
    notifyStackChanged();
  }
};

/** Returns the open-order position of a modal. */
const getStackIndex = (id: number): number => openModalIds.indexOf(id);

/** Checks whether a modal currently owns keyboard and backdrop actions. */
const isTopmostModal = (id: number): boolean =>
  openModalIds[openModalIds.length - 1] === id;

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Finds keyboard-focusable controls within the current dialog. */
const getFocusableElements = (dialog: HTMLElement): HTMLElement[] =>
  [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
      window.getComputedStyle(element).visibility !== "hidden",
  );

/** Manages accessible modal stacking, focus restoration, and Escape handling. */
export default function ModalWindow({
  isOpen,
  onClose,
  ariaLabel,
  closeLabel = "Close dialog",
  header,
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

    /** Keeps this dialog's stacking order synchronized with other open modals. */
    const syncStackIndex = () => {
      setStackIndex(getStackIndex(modalId));
    };

    syncStackIndex();
    window.addEventListener(stackChangeEventName, syncStackIndex);
    const focusTimer = window.setTimeout(() => {
      if (isTopmostModal(modalId)) {
        dialogRef.current?.focus({ preventScroll: true });
      }
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
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

    /** Keeps Tab navigation inside the topmost dialog and handles Escape. */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmostModal(modalId)) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }
      const focusable = getFocusableElements(dialog);
      const active = document.activeElement;
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (active === first || active === dialog || !dialog.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !dialog.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    /** Redirects programmatic focus changes away from background content. */
    const handleFocusIn = (event: FocusEvent) => {
      const dialog = dialogRef.current;
      if (
        !isTopmostModal(modalId) ||
        !dialog ||
        (event.target instanceof Node && dialog.contains(event.target))
      ) {
        return;
      }
      (getFocusableElements(dialog)[0] ?? dialog).focus();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn);
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
        <header className="modal-header">
          <div className="modal-header-content">{header}</div>
          <CloseButton ariaLabel={closeLabel} onClick={onClose} />
        </header>
        <div className="modal-content">{children}</div>
      </article>
    </div>,
    document.body,
  );
}
