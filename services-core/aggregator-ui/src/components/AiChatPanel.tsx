import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { askAgent } from "../services/aggregatorApi";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
};

type AiChatPanelProps = {
  isOpen: boolean;
};

export default function AiChatPanel({ isOpen }: AiChatPanelProps) {
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

  const appendMessage = (role: ChatMessage["role"], text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: nextMessageIdRef.current++, role, text },
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
            <span className="ai-chat-message-text">{message.text}</span>
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
