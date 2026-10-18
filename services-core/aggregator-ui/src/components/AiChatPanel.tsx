import type { FormEvent, KeyboardEvent, MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { askAgent } from "../services/aggregatorApi";
import { isPlainLeftClick } from "../shared/catalogUtils";
import { isUnhealthyHealthStatus } from "../shared/healthPresentation";
import { buildStatusText } from "../shared/statusText";
import CloseButton from "./CloseButton";
import type {
  AgentHealthDependencyContent,
  AgentHealthItemContent,
  AgentHealthSignalContent,
  AgentStructuredContent,
} from "../shared/types";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  structuredContent?: AgentStructuredContent | null;
};

type AiChatPanelProps = {
  isOpen: boolean;
  buildItemLink: (itemId: string) => string;
  onClose: () => void;
  onSelectItem: (itemId: string) => void;
};

export default function AiChatPanel({
  isOpen,
  buildItemLink,
  onClose,
  onSelectItem,
}: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const nextMessageIdRef = useRef(1);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    window.requestAnimationFrame(() => {
      const messagesElement = messagesRef.current;
      if (!messagesElement) {
        return;
      }
      messagesElement.scrollTop = messagesElement.scrollHeight;
    });
  }, [isOpen, messages]);

  const appendMessage = (
    role: ChatMessage["role"],
    text: string,
    structuredContent?: AgentStructuredContent | null,
  ) => {
    setMessages((prev) => [
      ...prev,
      { id: nextMessageIdRef.current++, role, text, structuredContent },
    ]);
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  const handleSend = async () => {
    const question = draft.trim();
    if (!question || isSending) {
      return;
    }
    appendMessage("user", question);
    setDraft("");
    setIsSending(true);
    try {
      const response = await askAgent(question);
      appendMessage(
        "assistant",
        response.answer || "The AI agent returned an empty answer.",
        response.structured_content,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The AI agent could not be reached.";
      appendMessage("assistant", message);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSend();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    void handleSend();
  };

  return (
    <aside
      className={`ai-chat-panel ${isOpen ? "is-open" : ""}`}
      aria-label="AI chat"
      aria-hidden={!isOpen}
    >
      <div className="ai-chat-header">
        <div className="ai-chat-title-block">
          <h2>AI chat</h2>
          <p>Ask about current product health</p>
        </div>
        <CloseButton ariaLabel="Close AI chat" onClick={onClose} />
        <div className="ai-chat-controls-row">
          <button
            type="button"
            className="ai-chat-clear"
            onClick={handleClearChat}
            disabled={messages.length === 0}
            aria-label="Clear chat history"
          >
            Clear chat
          </button>
        </div>
      </div>
      <div className="ai-chat-messages" aria-live="polite" ref={messagesRef}>
        {messages.length === 0 && (
          <p className="ai-chat-empty">
            <span>Ask a question to start the chat.</span>
            <span>
              I can answer Product Health questions: what is broken, why
              something is down, and current product or service health.
            </span>
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`ai-chat-message ai-chat-message-${message.role}`}
          >
            <span className="ai-chat-message-role">
              {message.role === "user" ? "You" : "AI"}
            </span>
            {message.role === "assistant" &&
            message.structuredContent?.type === "product_health" ? (
              <ProductHealthResponse
                intro={message.text}
                content={message.structuredContent}
                buildItemLink={buildItemLink}
                onSelectItem={onSelectItem}
              />
            ) : (
              <span className="ai-chat-message-text">{message.text}</span>
            )}
          </div>
        ))}
        {isSending && (
          <div className="ai-chat-message ai-chat-message-assistant">
            <span className="ai-chat-message-role">AI</span>
            <span className="ai-chat-message-text">Thinking...</span>
          </div>
        )}
      </div>
      <form className="ai-chat-input-row" onSubmit={handleSubmit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Ask a question"
          rows={2}
          disabled={isSending}
          aria-label="AI chat message"
        />
        <button type="submit" disabled={isSending || !draft.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}

type ProductHealthResponseProps = {
  intro: string;
  content: Extract<AgentStructuredContent, { type: "product_health" }>;
  buildItemLink: (itemId: string) => string;
  onSelectItem: (itemId: string) => void;
};

function ProductHealthResponse({
  intro,
  content,
  buildItemLink,
  onSelectItem,
}: ProductHealthResponseProps) {
  const introduction = intro || "Here are the Product Health results.";
  return (
    <div className="ai-health-response">
      <p className="ai-chat-message-text">{introduction}</p>
      {content.items.length > 0 && (
        <ul className="ai-health-item-list">
          {content.items.map((item) => (
            <ProductHealthItem
              key={item.item_id}
              item={item}
              buildItemLink={buildItemLink}
              onSelectItem={onSelectItem}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type ProductHealthItemProps = {
  item: AgentHealthItemContent;
  buildItemLink: (itemId: string) => string;
  onSelectItem: (itemId: string) => void;
};

function ProductHealthItem({
  item,
  buildItemLink,
  onSelectItem,
}: ProductHealthItemProps) {
  const unhealthySignals = item.signals.filter((signal) =>
    isUnhealthyHealthStatus(signal.state),
  );
  const dependenciesWithOwnUnhealthySignals =
    item.affecting_dependencies.filter((dependency) =>
      dependency.signals.some((signal) =>
        isUnhealthyHealthStatus(signal.state),
      ),
    );

  return (
    <li className="ai-health-item">
      <HealthItemLink
        itemId={item.item_id}
        title={item.title}
        state={item.state}
        className="ai-health-item-title"
        showState
        buildItemLink={buildItemLink}
        onSelectItem={onSelectItem}
      />
      {unhealthySignals.length > 0 && (
        <ul className="ai-health-signal-list ai-health-own-signal-list">
          {unhealthySignals.map((signal) => (
            <SignalFact signal={signal} key={signal.id} />
          ))}
        </ul>
      )}
      {dependenciesWithOwnUnhealthySignals.length > 0 && (
        <ul className="ai-health-dependency-list">
          {dependenciesWithOwnUnhealthySignals.map((dependency) => (
            <DependencyFact
              dependency={dependency}
              key={dependency.item_id}
              buildItemLink={buildItemLink}
              onSelectItem={onSelectItem}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function SignalFact({ signal }: { signal: AgentHealthSignalContent }) {
  const statusText = buildStatusText(signal.state);
  return (
    <li className="ai-health-fact-row">
      <span
        className={`status-indicator status-${signal.state}`}
        aria-label={statusText}
        title={statusText}
      />
      <span className="ai-health-fact-text">{signal.title}</span>
    </li>
  );
}

type DependencyFactProps = {
  dependency: AgentHealthDependencyContent;
  buildItemLink: (itemId: string) => string;
  onSelectItem: (itemId: string) => void;
};

function DependencyFact({
  dependency,
  buildItemLink,
  onSelectItem,
}: DependencyFactProps) {
  const unhealthySignals = dependency.signals.filter((signal) =>
    isUnhealthyHealthStatus(signal.state),
  );

  return (
    <li className="ai-health-dependency-item">
      <HealthItemLink
        itemId={dependency.item_id}
        title={dependency.title}
        state={dependency.state}
        className="ai-health-dependency-link"
        buildItemLink={buildItemLink}
        onSelectItem={onSelectItem}
      />
      {unhealthySignals.length > 0 && (
        <ul className="ai-health-signal-list ai-health-dependency-signal-list">
          {unhealthySignals.map((signal) => (
            <SignalFact signal={signal} key={signal.id} />
          ))}
        </ul>
      )}
    </li>
  );
}

type HealthItemLinkProps = {
  itemId: string;
  title: string;
  state: AgentHealthItemContent["state"];
  className: string;
  showState?: boolean;
  buildItemLink: (itemId: string) => string;
  onSelectItem: (itemId: string) => void;
};

function HealthItemLink({
  itemId,
  title,
  state,
  className,
  showState = false,
  buildItemLink,
  onSelectItem,
}: HealthItemLinkProps) {
  const statusText = buildStatusText(state);
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainLeftClick(event)) {
      return;
    }
    event.preventDefault();
    onSelectItem(itemId);
  };

  return (
    <a
      href={buildItemLink(itemId)}
      onClick={handleClick}
      className={className}
      aria-label={`${title}. ${statusText}`}
      title={`${title}. ${statusText}`}
    >
      <span className="ai-health-link-text">{title}</span>
      {showState && (
        <span
          className={`ai-health-item-state status-${state}`}
          aria-hidden="true"
        >
          {state.toUpperCase()}
        </span>
      )}
    </a>
  );
}
