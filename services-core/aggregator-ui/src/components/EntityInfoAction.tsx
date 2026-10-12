import type { MouseEvent } from "react";

type EntityInfoActionProps =
  | {
      label: string;
      href: string;
      onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
    }
  | {
      label: string;
      href?: never;
      onClick: () => void;
    };

/**
 * A persistent info icon that opens entity details, without turning the
 * adjacent name into a link.
 */
export default function EntityInfoAction(props: EntityInfoActionProps) {
  if (props.href !== undefined) {
    return (
      <a
        className="entity-info-action"
        href={props.href}
        aria-label={props.label}
        aria-haspopup="dialog"
        onClick={props.onClick}
      >
        ⓘ
      </a>
    );
  }

  return (
    <button
      type="button"
      className="entity-info-action"
      aria-label={props.label}
      aria-haspopup="dialog"
      onClick={props.onClick}
    >
      ⓘ
    </button>
  );
}
