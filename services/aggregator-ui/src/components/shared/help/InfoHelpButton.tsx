/** @file Provides the help button shared by live topics and passive demonstrations. */

import type { ButtonHTMLAttributes, Ref } from "react";

export default function InfoHelpButton({
  label,
  buttonRef,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="info-help-button"
      aria-label={label}
      disabled={!props.onClick}
      {...props}
    >
      ?
    </button>
  );
}
