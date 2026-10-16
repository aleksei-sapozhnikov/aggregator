import type { ButtonHTMLAttributes, Ref } from "react";

/** The same help affordance can be displayed without mounting a help dialog. */
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
