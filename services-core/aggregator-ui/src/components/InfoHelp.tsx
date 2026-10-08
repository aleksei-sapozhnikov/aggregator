import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { InfoHelpTopic } from "../shared/infoHelpTopics";
import CloseButton from "./CloseButton";

type InfoHelpProps = {
  topic: InfoHelpTopic;
};

export default function InfoHelp({ topic }: InfoHelpProps) {
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({
    left: 0,
    top: 0,
  });

  const showTooltip = () => {
    const button = buttonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      setTooltipPosition({
        left: rect.left + rect.width / 2,
        top: rect.top,
      });
    }
    setIsTooltipVisible(true);
  };

  useEffect(() => {
    if (!isModalOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModalOpen]);

  return (
    <span className="info-help">
      <button
        ref={buttonRef}
        type="button"
        className="info-help-button"
        aria-label={`About ${topic.title}`}
        aria-describedby={isTooltipVisible ? tooltipId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setIsTooltipVisible(false);
          setIsModalOpen(true);
        }}
        onFocus={showTooltip}
        onBlur={() => setIsTooltipVisible(false)}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setIsTooltipVisible(false)}
      >
        ?
      </button>
      {isTooltipVisible &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            className="info-help-tooltip"
            style={{
              left: `${tooltipPosition.left}px`,
              top: `${tooltipPosition.top}px`,
            }}
          >
            {topic.summary}
          </span>,
          document.body,
        )}
      {isModalOpen &&
        createPortal(
        <div
          className="about-overlay info-help-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`About ${topic.title}`}
          onClick={() => setIsModalOpen(false)}
        >
          <article
            className="about-modal info-help-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <CloseButton
              ariaLabel="Close contextual help"
              onClick={() => setIsModalOpen(false)}
            />
            <header className="info-help-modal-header">
              <h2>{topic.title}</h2>
            </header>
            <p>{topic.description}</p>
            {topic.details && topic.details.length > 0 && (
              <dl className="info-help-detail-list">
                {topic.details.map((entry) => (
                  <div key={entry.label} className="info-help-detail-row">
                    <dt>{entry.label}</dt>
                    <dd>
                      <code>{entry.value}</code>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </article>
        </div>,
          document.body,
        )}
    </span>
  );
}
