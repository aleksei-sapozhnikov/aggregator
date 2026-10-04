import { useEffect, useState } from "react";
import type { CatalogContact } from "../shared/types";
import {
  resolveContactLabel,
  resolveContactTypeDisplayName,
} from "../shared/contactUtils";
import CloseButton from "./CloseButton";

type ContactModalProps = {
  isOpen: boolean;
  contact: CatalogContact | null;
  onClose: () => void;
};

type ContactDemoKind =
  | "chat"
  | "email"
  | "phone"
  | "sms"
  | "oncall"
  | "generic";

type ContactDemoDetails = {
  appName: string;
  kind: ContactDemoKind;
  clientClass: string;
  iconLabel: string;
  realHref: string;
  subject?: string;
};

const normalizeContactHandle = (label: string): string =>
  label.replace(/^#+/, "").replace(/^@+/, "").trim() || "team";

const buildOutgoingText = (label: string): string =>
  `Hey ${normalizeContactHandle(label)}, I have a problem with a service.`;

const buildRealContactHref = (
  contact: CatalogContact,
  label: string,
): ContactDemoDetails => {
  const normalizedLabel = normalizeContactHandle(label);
  switch (contact.type) {
    case "email":
      return {
        appName: "Mail",
        kind: "email",
        clientClass: "mail",
        iconLabel: "M",
        realHref: `mailto:${label}?subject=Service%20problem`,
        subject: "Service problem",
      };
    case "phone":
      return {
        appName: "Phone",
        kind: "phone",
        clientClass: "phone",
        iconLabel: "P",
        realHref: `tel:${label.replace(/\s/g, "")}`,
      };
    case "sms":
      return {
        appName: "Messages",
        kind: "sms",
        clientClass: "messages",
        iconLabel: "M",
        realHref: `sms:${label.replace(/\s/g, "")}`,
      };
    case "teams":
      return {
        appName: "Microsoft Teams",
        kind: "chat",
        clientClass: "teams",
        iconLabel: "T",
        realHref: `msteams:/l/chat/0/0?users=${encodeURIComponent(normalizedLabel)}`,
      };
    case "slack":
      return {
        appName: "Slack",
        kind: "chat",
        clientClass: "slack",
        iconLabel: "S",
        realHref: `slack://channel?team=demo&id=${encodeURIComponent(normalizedLabel)}`,
      };
    case "telegram":
      return {
        appName: "Telegram",
        kind: "chat",
        clientClass: "telegram",
        iconLabel: "T",
        realHref: `tg://resolve?domain=${encodeURIComponent(normalizedLabel)}`,
      };
    case "discord":
      return {
        appName: "Discord",
        kind: "chat",
        clientClass: "discord",
        iconLabel: "D",
        realHref: `discord://-/channels/demo/${encodeURIComponent(normalizedLabel)}`,
      };
    case "mattermost":
      return {
        appName: "Mattermost",
        kind: "chat",
        clientClass: "mattermost",
        iconLabel: "M",
        realHref: `mattermost://demo/channels/${encodeURIComponent(normalizedLabel)}`,
      };
    case "pagerduty":
      return {
        appName: "PagerDuty",
        kind: "oncall",
        clientClass: "pagerduty",
        iconLabel: "PD",
        realHref: `https://example.pagerduty.com/escalation_policies/${encodeURIComponent(contact.id)}`,
      };
    case "opsgenie":
      return {
        appName: "Opsgenie",
        kind: "oncall",
        clientClass: "opsgenie",
        iconLabel: "O",
        realHref: `https://example.app.opsgenie.com/team/${encodeURIComponent(normalizedLabel)}`,
      };
    default:
      return {
        appName: resolveContactTypeDisplayName(contact.type),
        kind: "generic",
        clientClass: "generic",
        iconLabel: "?",
        realHref:
          contact.href && !contact.href.startsWith("/contacts/")
            ? contact.href
            : `https://contacts.example.com/${encodeURIComponent(contact.id)}`,
      };
  }
};

const ContactDemoWindowBar = ({
  details,
  title,
}: {
  details: ContactDemoDetails;
  title: string;
}) => (
  <div className="contact-demo-window-bar">
    <span className="contact-window-title">
      <span className="contact-window-icon">{details.iconLabel}</span>
      <span>{details.appName}</span>
    </span>
    <span className="contact-window-context">{title}</span>
  </div>
);

const renderContactDemo = (
  label: string,
  details: ContactDemoDetails,
  typedText: string,
  isMessageSent: boolean,
  showResponse: boolean,
) => {
  if (details.kind === "email") {
    return (
      <section
        className={`contact-demo contact-demo-email contact-client-${details.clientClass}`}
        aria-label="Email client preview"
      >
        <ContactDemoWindowBar details={details} title="New message" />
        <div className="contact-email-fields">
          <div>
            <span>To</span>
            <strong>{label}</strong>
          </div>
          <div>
            <span>Subject</span>
            <strong>{details.subject}</strong>
          </div>
        </div>
        <div className="contact-email-compose">
          <p className="contact-email-body">
            {typedText}
            {!isMessageSent && <span className="contact-typing-caret" />}
          </p>
          <div className="contact-email-actions">
            <button type="button">Send</button>
          </div>
        </div>
      </section>
    );
  }

  if (details.kind === "phone") {
    return (
      <section
        className={`contact-demo contact-demo-phone contact-client-${details.clientClass}`}
        aria-label="Phone app preview"
      >
        <ContactDemoWindowBar details={details} title="Call" />
        <div className="contact-phone-screen">
          <span className="contact-phone-icon" aria-hidden="true">
            {details.iconLabel}
          </span>
          <span className="contact-phone-label">Calling</span>
          <strong>{label}</strong>
          <span className="contact-phone-status">Ringing...</span>
        </div>
      </section>
    );
  }

  if (details.kind === "sms") {
    return (
      <section
        className={`contact-demo contact-demo-chat contact-client-${details.clientClass}`}
        aria-label="Messages preview"
      >
        <ContactDemoWindowBar details={details} title={label} />
        <div className="contact-chat-thread">
          {isMessageSent && (
            <p className="contact-chat-bubble contact-chat-bubble-out">
              {typedText}
            </p>
          )}
          {showResponse && (
            <p className="contact-chat-bubble contact-chat-bubble-in">
              Ok, on it!
            </p>
          )}
        </div>
        <div className="contact-chat-composer">
          {isMessageSent ? `Message ${label}` : typedText}
          {!isMessageSent && <span className="contact-typing-caret" />}
        </div>
      </section>
    );
  }

  if (details.kind === "oncall") {
    return (
      <section
        className={`contact-demo contact-demo-oncall contact-client-${details.clientClass}`}
        aria-label="On-call profile preview"
      >
        <ContactDemoWindowBar details={details} title="Escalation" />
        <div className="contact-oncall-profile">
          <span className="contact-oncall-avatar">{details.iconLabel}</span>
          <div>
            <strong>{label}</strong>
            <span>Primary responder available</span>
          </div>
        </div>
        <div className="contact-oncall-actions">
          <button type="button">Create incident</button>
          <button type="button">Page responder</button>
        </div>
        <p className="contact-oncall-note">
          Service problem attached to the escalation.
        </p>
      </section>
    );
  }

  if (details.kind === "generic") {
    return (
      <section
        className={`contact-demo contact-demo-generic contact-client-${details.clientClass}`}
        aria-label="Contact application preview"
      >
        <ContactDemoWindowBar details={details} title="Contact destination" />
        <div className="contact-generic-card">
          <strong>{label}</strong>
          <span>External contact application opened from the catalog link.</span>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`contact-demo contact-demo-chat contact-client-${details.clientClass}`}
      aria-label="Team chat preview"
    >
      <ContactDemoWindowBar details={details} title={label} />
      <div className="contact-chat-thread">
        {isMessageSent && (
          <p className="contact-chat-bubble contact-chat-bubble-out">
            {typedText}
          </p>
        )}
        {showResponse && (
          <p className="contact-chat-bubble contact-chat-bubble-in">
            Ok, on it!
          </p>
        )}
      </div>
      <div className="contact-chat-composer">
        {isMessageSent ? `Message ${label}` : typedText}
        {!isMessageSent && <span className="contact-typing-caret" />}
      </div>
    </section>
  );
};

export default function ContactModal({
  isOpen,
  contact,
  onClose,
}: ContactModalProps) {
  const [typedLength, setTypedLength] = useState(0);
  const [showResponse, setShowResponse] = useState(false);
  const contactLabel = contact ? resolveContactLabel(contact) : "";
  const outgoingText = contact ? buildOutgoingText(contactLabel) : "";

  useEffect(() => {
    setTypedLength(0);
    setShowResponse(false);

    if (!isOpen || !contact || !outgoingText) {
      return undefined;
    }

    let nextLength = 0;
    const intervalId = window.setInterval(() => {
      nextLength += 1;
      setTypedLength(nextLength);
      if (nextLength >= outgoingText.length) {
        window.clearInterval(intervalId);
      }
    }, 28);

    const responseTimeoutId = window.setTimeout(
      () => setShowResponse(true),
      outgoingText.length * 28 + 1600,
    );

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(responseTimeoutId);
    };
  }, [contact, isOpen, outgoingText]);

  if (!isOpen || !contact) {
    return null;
  }

  const openedByLink = `/contacts/${contact.id}`;
  const demoDetails = buildRealContactHref(contact, contactLabel);
  const typedText = outgoingText.slice(0, typedLength);
  const isMessageSent = typedLength >= outgoingText.length;

  return (
    <div
      className="about-overlay contact-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Contact details"
      onClick={onClose}
    >
      <article
        className="about-modal contact-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <CloseButton ariaLabel="Close contact details" onClick={onClose} />
        <header className="contact-modal-header">
          <span className="contact-modal-kicker">
            {demoDetails.appName} demo
          </span>
          <h2>{contactLabel}</h2>
        </header>
        <div className="contact-modal-body">
          {renderContactDemo(
            contactLabel,
            demoDetails,
            typedText,
            isMessageSent,
            showResponse,
          )}
          <div className="contact-modal-demo-note">
            <p>
              Demo: the catalog link opened this preview inside Aggregator:{" "}
              <span className="contact-modal-link-preview">{openedByLink}</span>
              .
            </p>
            <p>
              In a real setup, the same contact would open the actual external
              client when the link looks like:{" "}
              <span className="contact-modal-link-preview">
                {demoDetails.realHref}
              </span>
              .
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}
