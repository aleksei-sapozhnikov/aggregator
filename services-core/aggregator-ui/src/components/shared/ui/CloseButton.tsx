type CloseButtonProps = {
  ariaLabel: string;
  onClick: () => void;
};

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
