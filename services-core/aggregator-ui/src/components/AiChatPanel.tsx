import type { FormEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { askAgent } from "../services/aggregatorApi";
import { isPlainLeftClick } from "../shared/catalogUtils";
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
  onSelectItem: (itemId: string) => void;
};

export default function AiChatPanel({
  isOpen,
  buildItemLink,
  onSelectItem,
}: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const nextMessageIdRef = useRef(1);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    messageEndRef.current?.scrollIntoView({ block: "end" });
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
      <div className="ai-chat-messages" aria-live="polite">
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
            message.structuredContent?.type === "unhealthy_items" ? (
              <UnhealthyItemsResponse
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
        <div ref={messageEndRef} />
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

type UnhealthyItemsResponseProps = {
  content: Extract<AgentStructuredContent, { type: "unhealthy_items" }>;
  buildItemLink: (itemId: string) => string;
  onSelectItem: (itemId: string) => void;
};

function UnhealthyItemsResponse({
  content,
  buildItemLink,
  onSelectItem,
}: UnhealthyItemsResponseProps) {
  if (content.items.length === 0) {
    return (
      <span className="ai-chat-message-text">
        {content.presentation.healthy_message}
      </span>
    );
  }

  return (
    <div className="ai-health-response">
      <p className="ai-health-response-header">{content.presentation.header}</p>
      <ul className="ai-health-item-list">
        {content.items.map((item) => (
          <ProductHealthItem
            key={item.item_id}
            item={item}
            labels={content.presentation}
            buildItemLink={buildItemLink}
            onSelectItem={onSelectItem}
          />
        ))}
      </ul>
    </div>
  );
}

type ProductHealthItemLabels = {
  signals_label: string;
  dependencies_label: string;
};

type ProductHealthItemProps = {
  item: AgentHealthItemContent;
  labels: ProductHealthItemLabels;
  buildItemLink: (itemId: string) => string;
  onSelectItem: (itemId: string) => void;
};

function ProductHealthItem({
  item,
  labels,
  buildItemLink,
  onSelectItem,
}: ProductHealthItemProps) {
  return (
    <li className="ai-health-item">
      <HealthItemLink
        itemId={item.item_id}
        title={item.title}
        state={item.state}
        className="ai-health-item-title"
        buildItemLink={buildItemLink}
        onSelectItem={onSelectItem}
      />
      {item.signals.length > 0 && (
        <HealthFactGroup label={labels.signals_label}>
          {item.signals.map((signal) => (
            <SignalFact signal={signal} key={signal.id} />
          ))}
        </HealthFactGroup>
      )}
      {item.affecting_dependencies.length > 0 && (
        <HealthFactGroup label={labels.dependencies_label}>
          {item.affecting_dependencies.map((dependency) => (
            <DependencyFact
              dependency={dependency}
              signalLabel={labels.signals_label}
              key={dependency.item_id}
              buildItemLink={buildItemLink}
              onSelectItem={onSelectItem}
            />
          ))}
        </HealthFactGroup>
      )}
    </li>
  );
}

type HealthFactGroupProps = {
  label: string;
  children: ReactNode;
};

function HealthFactGroup({ label, children }: HealthFactGroupProps) {
  return (
    <div className="ai-health-fact-group">
      <div className="ai-health-fact-label">{label}</div>
      <ul className="ai-health-fact-list">{children}</ul>
    </div>
  );
}

function SignalFact({ signal }: { signal: AgentHealthSignalContent }) {
  return (
    <li className="ai-health-fact-row">
      <span
        className={`status-indicator status-${signal.state}`}
        aria-label={signal.state}
      />
      <span className="ai-health-fact-text">{signal.title}</span>
    </li>
  );
}

type DependencyFactProps = {
  dependency: AgentHealthDependencyContent;
  signalLabel: string;
  buildItemLink: (itemId: string) => string;
  onSelectItem: (itemId: string) => void;
};

function DependencyFact({
  dependency,
  signalLabel,
  buildItemLink,
  onSelectItem,
}: DependencyFactProps) {
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
      {dependency.signals.length > 0 && (
        <HealthFactGroup label={signalLabel}>
          {dependency.signals.map((signal) => (
            <SignalFact signal={signal} key={signal.id} />
          ))}
        </HealthFactGroup>
      )}
    </li>
  );
}

type HealthItemLinkProps = {
  itemId: string;
  title: string;
  state: AgentHealthItemContent["state"];
  className: string;
  buildItemLink: (itemId: string) => string;
  onSelectItem: (itemId: string) => void;
};

function HealthItemLink({
  itemId,
  title,
  state,
  className,
  buildItemLink,
  onSelectItem,
}: HealthItemLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainLeftClick(event)) {
      return;
    }
    event.preventDefault();
    onSelectItem(itemId);
  };

  return (
    <a href={buildItemLink(itemId)} onClick={handleClick} className={className}>
      <span className={`status-indicator status-${state}`} aria-label={state} />
      <span className="ai-health-link-text">{title}</span>
    </a>
  );
}
