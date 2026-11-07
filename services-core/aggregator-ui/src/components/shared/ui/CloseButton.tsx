/** @file Provides the shared modal close control. */

type CloseButtonProps = {
  ariaLabel: string;
  onClick: () => void;
};

/** Renders the shared close affordance used by modal dialogs. */
export default function CloseButton({ ariaLabel, onClick }: CloseButtonProps) {
  return (
    <button
      type="button"
      className="about-close"
      aria-label={ariaLabel}
      onClick={onClick}
    >
      ×
    </button>
  );
}
