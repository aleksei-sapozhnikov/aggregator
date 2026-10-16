import { createContext, useContext, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { InfoHelpTopic } from "../shared/infoHelpTopics";
import ModalWindow from "./ModalWindow";
import TimelineHelpDemo from "./about/timeline/TimelineHelpDemo";
import SignalFlowHelpDemo from "./about/signal-flow/SignalFlowHelpDemo";
import ActorsHelpDemo from "./about/actors/ActorsHelpDemo";
import PrimaryContactHelpDemo from "./about/primary-contact/PrimaryContactHelpDemo";

type InfoHelpProps = {
  topic: InfoHelpTopic;
};
type InfoHelpContextValue = {
  activeTopic: InfoHelpTopic | null;
  openTopic: (topic: InfoHelpTopic) => void;
};

const InfoHelpContext = createContext<InfoHelpContextValue | null>(null);

// The dialog belongs to a stable parent, not the conditional source section.
function InfoHelpDialog({ topic, onClose }: { topic: InfoHelpTopic; onClose: () => void }) {
  return (
      <ModalWindow
        isOpen={true}
        onClose={onClose}
        ariaLabel={`About ${topic.title}`}
        closeLabel="Close contextual help"
        header={<h2>{topic.title}</h2>}
      >
        <div className="info-help-modal">
          <div className="info-help-description modal-text-flow">
            <p>{topic.description}</p>
          </div>
          {topic.demo === "timeline" && <TimelineHelpDemo />}
          {topic.demo === "actors" && <ActorsHelpDemo />}
          {topic.demo === "primary-contact" && <PrimaryContactHelpDemo />}
          {topic.demo === "healthy-signals" && <SignalFlowHelpDemo mode="healthy" />}
          {topic.demo === "unhealthy-signals" && <SignalFlowHelpDemo mode="unhealthy" />}
          {topic.sections && topic.sections.length > 0 && (
            <div className="info-help-sections">
              {topic.sections.map((section) => (
                <section key={section.heading} className="info-help-section">
                  <h3>{section.heading}</h3>
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.items && section.items.length > 0 && (
                    <dl className="info-help-section-list">
                      {section.items.map((entry) => (
                        <div
                          key={`${section.heading}:${entry.label}`}
                          className="info-help-section-row"
                        >
                          <dt>{entry.label}</dt>
                          <dd>{entry.text}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
              ))}
            </div>
          )}
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
        </div>
      </ModalWindow>
  );
}

export function InfoHelpProvider({ children }: { children: ReactNode }) {
  const [activeTopic, setActiveTopic] = useState<InfoHelpTopic | null>(null);
  const context = useMemo(() => ({ activeTopic, openTopic: setActiveTopic }), [activeTopic]);

  return (
    <InfoHelpContext.Provider value={context}>
      {children}
      {activeTopic && <InfoHelpDialog topic={activeTopic} onClose={() => setActiveTopic(null)} />}
    </InfoHelpContext.Provider>
  );
}


export default function InfoHelp({ topic }: InfoHelpProps) {
  const sharedHelp = useContext(InfoHelpContext);
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({
    left: 0,
    top: 0,
  });

  const showTooltip = () => {
    if (sharedHelp ? sharedHelp.activeTopic !== null : isModalOpen) {
      return;
    }

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
          if (sharedHelp) {
            sharedHelp.openTopic(topic);
          } else {
            setIsModalOpen(true);
          }
        }}
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
      {!sharedHelp && isModalOpen && (
        <InfoHelpDialog topic={topic} onClose={() => setIsModalOpen(false)} />
      )}
    </span>
  );
}
