/** @file Resolves help topics and opens their dialogs from item/section help buttons. */

import { useContext, useId, useRef, useState } from "react";
import { HelpContext, type HelpTopic } from "./HelpContext";
import InfoHelpButton from "./InfoHelpButton";
import HelpTooltip from "./HelpTooltip";

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
  const resolved = topic ?? (topicId ? help?.resolveTopic(topicId) : null);

  if (!help || !resolved) {
    throw new Error(
      "InfoHelp must be used within ContextualHelpProvider with a known topic.",
    );
  }

  const showTooltip = () => {
    if (help.activeTopic !== null) return;
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
      <HelpTooltip
        id={tooltipId}
        anchorRef={buttonRef}
        visible={isTooltipVisible}
        content={resolved.summary}
        action="Click for details"
      />
    </span>
  );
}
