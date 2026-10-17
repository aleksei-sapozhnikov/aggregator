/** @file Renders a consistent detail link/button for entity dialogs. */

import type { MouseEvent, ReactNode } from "react";

type TriggerBaseProps = {
  children: ReactNode;
  className?: string;
  title?: string;
  ariaLabel?: string;
};

type ModalDetailsTriggerProps = TriggerBaseProps &
  (
    | {
        href: string;
        onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
      }
    | {
        href?: never;
        onClick?: () => void;
      }
  );

/**
 * A text-style trigger for a details modal. Keep real links for routable
 * details (such as signals) and buttons for modal-only entities.
 */
export default function ModalDetailsTrigger(props: ModalDetailsTriggerProps) {
  const className = [
    "details-text-link",
    "modal-details-trigger",
    props.className,
  ]
    .filter(Boolean)
    .join(" ");

  if (props.href !== undefined) {
    return (
      <a
        href={props.href}
        className={className}
        title={props.title}
        aria-label={props.ariaLabel}
        aria-haspopup="dialog"
        onClick={props.onClick}
      >
        {props.children}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={props.title}
      aria-label={props.ariaLabel}
      aria-haspopup="dialog"
      disabled={!props.onClick}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
