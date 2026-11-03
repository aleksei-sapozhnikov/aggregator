import { useContext, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpContext, type HelpTopic } from "./HelpContext";
import InfoHelpButton from "./InfoHelpButton";

/** Displays a help trigger without depending on help content or illustrations. */
export default function InfoHelp({
  topicId,
  topic,
}: {
  topicId?: string;
  topic?: HelpTopic;
}) {
  const help = useContext(HelpContext);
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 });
  const resolved = topic ?? (topicId ? help?.resolveTopic(topicId) : null);

  if (!help || !resolved) {
    throw new Error(
      "InfoHelp must be used within ContextualHelpProvider with a known topic.",
    );
  }

  const showTooltip = () => {
    if (help.activeTopic !== null) return;
    const button = buttonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      setTooltipPosition({ left: rect.left + rect.width / 2, top: rect.top });
    }
    setIsTooltipVisible(true);
  };

  return (
    <span className="info-help">
      <InfoHelpButton
        buttonRef={buttonRef}
        label={`About ${resolved.title}`}
        aria-describedby={isTooltipVisible ? tooltipId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setIsTooltipVisible(false);
          help.openTopic(resolved);
        }}
        onBlur={() => setIsTooltipVisible(false)}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setIsTooltipVisible(false)}
      />
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
            {resolved.summary}
          </span>,
          document.body,
        )}
    </span>
  );
}
