/** @file Displays a selected help topic using common modal components. */

import type { HelpTopic } from "../../shared/help/HelpContext";
import ModalWindow from "../../shared/ui/ModalWindow";
import "./ContextualHelpDialog.css";

/** Displays a topic's registered content, sections, and optional metadata. */
export default function ContextualHelpDialog({
  topic,
  onClose,
}: {
  topic: HelpTopic;
  onClose: () => void;
}) {
  return (
    <ModalWindow
      isOpen
      onClose={onClose}
      ariaLabel={`About ${topic.title}`}
      closeLabel="Close contextual help"
      header={<h2>{topic.title}</h2>}
    >
      <div className="info-help-modal">
        {topic.content ??
          (topic.description && (
            <div className="info-help-description modal-text-flow">
              <p>{topic.description}</p>
            </div>
          ))}
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
