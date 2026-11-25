import { FormEvent, useMemo, useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { marked } from "marked";
import "./styles.css";

marked.setOptions({
  breaks: true,
  gfm: true
});

function renderMarkdown(content: string): string {
  try {
    return marked.parse(content) as string;
  } catch {
    return content;
  }
}

type Metadata = {
  resolution_source: "LIVE_INFERENCE" | "LLM_CACHE";
  model: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  key_id: string | null;
  fallback_attempts: number;
};

type Entry =
  | { role: "user"; content: string; time: string }
  | { role: "assistant"; content: string; metadata: Metadata; time: string }
  | { role: "error"; content: string; time: string };

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

const QUICK_SUGGESTIONS = [
  "What is LYFTR AI?",
  "What is the capital of France?",
  "How does caching work?",
  "Test key failover ⚡"
];

const EMOJI_LIST = ["⚡", "🤖", "🚀", "💡", "🔥", "👍", "🛡️", "👀", "✨", "💯"];

function getCurrentTime(): string {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getFormattedDate(): string {
  const options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };
  return new Date().toLocaleDateString("en-US", options);
}

function App() {
  const [sessionId, setSessionId] = useState(() => `s-${crypto.randomUUID()}`);
  const [message, setMessage] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showSystemPrompt, setShowSystemPrompt] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentNotice, setShowAttachmentNotice] = useState(false);
  const [simulateHeader, setSimulateHeader] = useState<string>("");
  const [isMinimized, setIsMinimized] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([
    {
      role: "assistant",
      content: "Hi there! Welcome to LYFTR AI. I'm your resilient LLM assistant with automatic multi-key failover and built-in caching. How can I help you today?",
      metadata: {
        resolution_source: "LIVE_INFERENCE",
        model: "groq/openai/gpt-oss-120b",
        latency_ms: 120,
        input_tokens: 24,
        output_tokens: 38,
        key_id: "key_1",
        fallback_attempts: 0
      },
      time: getCurrentTime()
    }
  ]);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, sending]);

  function resetChat() {
    setSessionId(`s-${crypto.randomUUID()}`);
    setEntries([
      {
        role: "assistant",
        content: "Chat session refreshed. A new private session has started. What would you like to explore?",
        metadata: {
          resolution_source: "LIVE_INFERENCE",
          model: "groq/openai/gpt-oss-120b",
          latency_ms: 85,
          input_tokens: 18,
          output_tokens: 25,
          key_id: "key_1",
          fallback_attempts: 0
        },
        time: getCurrentTime()
      }
    ]);
  }

  async function sendMessageWithText(textToSend: string) {
    const text = textToSend.trim();
    if (!text || sending) return;

    setMessage("");
    setShowEmojiPicker(false);
    setShowAttachmentNotice(false);
    setEntries((current) => [...current, { role: "user", content: text, time: getCurrentTime() }]);
    setSending(true);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (simulateHeader) {
        headers["X-Simulate-Failure"] = simulateHeader;
      }

      const response = await fetch(`${apiBaseUrl}/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          session_id: sessionId,
          message: text,
          ...(systemPrompt.trim() ? { system_prompt: systemPrompt.trim() } : {})
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.detail === "string" ? body.detail : "Unable to send message. Please try again.");
      }
      setEntries((current) => [
        ...current,
        { role: "assistant", content: body.reply, metadata: body.metadata, time: getCurrentTime() }
      ]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to send message. Please try again.";
      setEntries((current) => [...current, { role: "error", content: detail, time: getCurrentTime() }]);
    } finally {
      setSending(false);
      setTimeout(() => chatInputRef.current?.focus(), 100);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessageWithText(message);
  }

  function addEmoji(emoji: string) {
    setMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);
    chatInputRef.current?.focus();
  }

  return (
    <div className="app-container">
      {/* Background ambient neon glow effects */}
      <div className="ambient-glow glow-green"></div>
      <div className="ambient-glow glow-red"></div>

      {isMinimized ? (
        <button
          className="widget-launcher"
          onClick={() => setIsMinimized(false)}
          title="Open LYFTR AI Chat"
          aria-label="Open LYFTR AI Chat"
        >
          <div className="launcher-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span className="online-indicator-dot"></span>
          </div>
          <span className="launcher-label">LYFTR Bot</span>
        </button>
      ) : (
        <main className="chat-widget" aria-label="Chat conversation widget">
          {/* Top Bar / Header */}
          <header className="widget-header">
            <div className="header-bot-info">
              <div className="bot-avatar-container">
                <div className="bot-avatar">
                  {/* Neon Cyber Bot Icon */}
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A2.5 2.5 0 0 0 5 15.5 2.5 2.5 0 0 0 7.5 18 2.5 2.5 0 0 0 10 15.5 2.5 2.5 0 0 0 7.5 13m9 0a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 2.5-2.5 2.5 2.5 0 0 0-2.5-2.5" />
                  </svg>
                  <span className="bot-pulse-ring"></span>
                </div>
              </div>
              <div className="bot-titles">
                <div className="bot-name-row">
                  <span className="bot-name">LYFTR Bot</span>
                  <span className="neon-tag">AI 3.8</span>
                </div>
                <div className="bot-status-row">
                  <span className="status-dot"></span>
                  <span className="status-text">We're online …</span>
                </div>
              </div>
            </div>

            <div className="header-actions">
              {/* Simulation Failure Dropdown */}
              <select
                className={`simulation-select ${simulateHeader ? "sim-active" : ""}`}
                value={simulateHeader}
                onChange={(e) => setSimulateHeader(e.target.value)}
                title="Simulate Key Failure (Failover testing)"
              >
                <option value="">Simulation: Off</option>
                <option value="key_1=429">Simulate: key_1=429</option>
                <option value="key_1=500">Simulate: key_1=500</option>
                <option value="*=429">Simulate: All=429 (503)</option>
              </select>

              {/* Prompt Settings Toggle */}
              <button
                type="button"
                className={`header-icon-btn ${showSystemPrompt ? "active" : ""}`}
                onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                title="System Prompt Settings"
                aria-label="Toggle system prompt configuration"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </button>

              {/* Chat refresh button */}
              <button
                type="button"
                className="header-icon-btn refresh-btn"
                onClick={resetChat}
                title="Chat refresh button (Start new session)"
                aria-label="Refresh chat session"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
              </button>

              {/* Button for minimizing the widget */}
              <button
                type="button"
                className="header-icon-btn minimize-btn"
                onClick={() => setIsMinimized(true)}
                title="Button for minimizing the widget"
                aria-label="Minimize chat widget"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </header>

          {/* System Prompt Collapsible Configuration Tray */}
          {showSystemPrompt && (
            <div className="system-prompt-drawer">
              <label className="prompt-label" htmlFor="system-prompt">
                System prompt <span className="optional-tag">optional</span>
              </label>
              <textarea
                id="system-prompt"
                data-testid="system-prompt-input"
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                placeholder="You are a concise, helpful assistant."
                maxLength={4000}
                rows={2}
              />
            </div>
          )}

          {/* Date Divider */}
          <div className="date-divider">
            <span className="date-line"></span>
            <span className="date-text">{getFormattedDate()}</span>
            <span className="date-line"></span>
          </div>

          {/* Conversation history scrollbar & messages container */}
          <div className="messages" aria-live="polite">
            {entries.length === 0 && (
              <p className="empty-state">Ask a question to start the conversation.</p>
            )}

            {entries.map((entry, index) => {
              if (entry.role === "user") {
                return (
                  <article className="message user" key={index}>
                    <div className="message-content">
                      <p>{entry.content}</p>
                      <span className="message-time">{entry.time}</span>
                    </div>
                  </article>
                );
              }

              if (entry.role === "error") {
                return (
                  <article className="message error" key={index}>
                    <div className="error-icon-badge">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                    </div>
                    <div className="message-content">
                      <span className="error-title">Request failed</span>
                      <p>{entry.content}</p>
                      <span className="message-time">{entry.time}</span>
                    </div>
                  </article>
                );
              }

              return (
                <article
                  className="message assistant"
                  data-testid="assistant-message"
                  key={index}
                >
                  <div className="assistant-avatar">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2" />
                    </svg>
                  </div>
                  <div className="message-content">
                    <div className="assistant-header-row">
                      <span className="assistant-name">LYFTR AI</span>
                      <span className="message-time">{entry.time}</span>
                    </div>
                    <div
                      className="message-markdown"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.content) }}
                    />

                    {/* Request Metadata Inspector */}
                    <div className="metadata" aria-label="Response metadata">
                      <div className="meta-item">
                        <span className="meta-label">Resolution source:</span>
                        <span
                          data-testid="meta-source"
                          className={`meta-badge ${entry.metadata.resolution_source === "LLM_CACHE" ? "badge-cache" : "badge-live"}`}
                        >
                          {entry.metadata.resolution_source}
                        </span>
                      </div>

                      <div className="meta-item">
                        <span className="meta-label">Model:</span>
                        <span data-testid="meta-model" className="meta-badge badge-neutral">
                          {entry.metadata.model}
                        </span>
                      </div>

                      <div className="meta-item">
                        <span className="meta-label">Latency:</span>
                        <span data-testid="meta-latency" className="meta-badge badge-neutral">
                          {entry.metadata.latency_ms} ms
                        </span>
                      </div>

                      <div className="meta-item">
                        <span className="meta-label">Tokens:</span>
                        <span className="meta-badge badge-tokens">
                          in: <span data-testid="meta-input-tokens">{entry.metadata.input_tokens}</span>
                          {" · "}
                          out: <span data-testid="meta-output-tokens">{entry.metadata.output_tokens}</span>
                        </span>
                      </div>

                      {entry.metadata.key_id && (
                        <div className="meta-item">
                          <span className="meta-label">Key:</span>
                          <span className="meta-badge badge-key">
                            {entry.metadata.key_id}
                          </span>
                        </div>
                      )}

                      {entry.metadata.fallback_attempts > 0 && (
                        <div className="meta-item">
                          <span className="meta-badge badge-fallback">
                            ⚠️ Failover ({entry.metadata.fallback_attempts})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}

            {sending && (
              <div className="thinking-row">
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span className="thinking">LYFTR AI is thinking…</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick reply buttons / Suggested reply chips */}
          <div className="quick-replies-section" aria-label="Suggested quick replies">
            <div className="quick-replies-scroll">
              {QUICK_SUGGESTIONS.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="quick-reply-pill"
                  onClick={() => sendMessageWithText(suggestion)}
                  disabled={sending}
                >
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Emoji selection popup */}
          {showEmojiPicker && (
            <div className="emoji-picker-tray" role="dialog" aria-label="Emoji selection">
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="emoji-chip"
                  onClick={() => addEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Attachment notification banner */}
          {showAttachmentNotice && (
            <div className="attachment-notice">
              <span>📎 Attachments: File upload ready for next inference cycle.</span>
              <button type="button" onClick={() => setShowAttachmentNotice(false)}>✕</button>
            </div>
          )}

          {/* Message input text field & footer composer */}
          <form onSubmit={handleSubmit} className="composer">
            <div className="composer-bar">
              {/* Emoji selection button */}
              <button
                type="button"
                className={`composer-tool-btn ${showEmojiPicker ? "active" : ""}`}
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                title="Emoji selection"
                aria-label="Toggle emoji picker"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                  <line x1="9" y1="9" x2="9.01" y2="9"></line>
                  <line x1="15" y1="9" x2="15.01" y2="9"></line>
                </svg>
              </button>

              {/* Attachments button */}
              <button
                type="button"
                className={`composer-tool-btn ${showAttachmentNotice ? "active" : ""}`}
                onClick={() => setShowAttachmentNotice(!showAttachmentNotice)}
                title="Attachments"
                aria-label="Attach file"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                </svg>
              </button>

              {/* Message input text field */}
              <textarea
                ref={chatInputRef}
                data-testid="chat-input"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSubmit(event);
                  }
                }}
                placeholder="Enter message..."
                maxLength={4000}
                rows={1}
                disabled={sending}
              />

              {/* Send button with paper plane icon */}
              <button
                data-testid="send-button"
                type="submit"
                className="send-button"
                disabled={sending || !message.trim()}
                title="Send message"
                aria-label="Send message"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </form>
        </main>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
