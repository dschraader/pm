"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import clsx from "clsx";
import {
  ApiError,
  fetchChatHistory,
  sendChatMessage,
  type ChatMessageRecord,
} from "@/lib/api";
import { computeChangedIds } from "@/lib/highlights";
import type { BoardData } from "@/lib/kanban";

type ChatSidebarProps = {
  board: BoardData | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onBoardUpdate: (
    next: BoardData,
    diff: (before: BoardData, after: BoardData) => Set<string>
  ) => void;
};

const errorMessage = (err: unknown): string => {
  if (err instanceof ApiError) {
    return `Request failed (${err.status}).`;
  }
  return "Network error.";
};

const formatTime = (iso: string | null): string => {
  if (!iso) return "";
  const date = new Date(iso.includes("Z") ? iso : iso + "Z");
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const ChatSidebar = ({
  board,
  open: openProp,
  onOpenChange,
  onBoardUpdate,
}: ChatSidebarProps) => {
  const [openInternal, setOpenInternal] = useState(true);
  const open = openProp ?? openInternal;
  const setOpen = onOpenChange ?? setOpenInternal;
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchChatHistory()
      .then((data) => setMessages(data.messages))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages.length, sending]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const optimistic: ChatMessageRecord = {
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    try {
      const response = await sendChatMessage(text);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.reply,
          created_at: new Date().toISOString(),
        },
      ]);
      if (board) {
        onBoardUpdate(response.board, (before, after) =>
          computeChangedIds(response.appliedMutations, before, after)
        );
      } else {
        onBoardUpdate(response.board, () => new Set());
      }
    } catch (err) {
      setMessages((prev) => prev.slice(0, -1));
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }, [board, draft, onBoardUpdate, sending]);

  const handleKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-6 bottom-6 z-40 flex items-center gap-2 rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-[var(--shadow)] transition hover:brightness-110"
        data-testid="chat-sidebar-open"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        AI chat
      </button>
    );
  }

  return (
    <aside
      data-testid="chat-sidebar"
      className="fixed right-0 top-0 z-30 flex h-screen w-[380px] flex-col border-l border-[var(--stroke)] bg-white/95 shadow-[var(--shadow)] backdrop-blur"
    >
      <header className="flex items-center justify-between border-b border-[var(--stroke)] px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
            AI assistant
          </p>
          <p className="mt-1 text-base font-semibold text-[var(--navy-dark)]">
            Ask about your board
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-[var(--stroke)] p-2 text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
          aria-label="Collapse AI chat"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4"
        data-testid="chat-messages"
      >
        {messages.length === 0 && !sending && (
          <p className="my-auto text-center text-sm text-[var(--gray-text)]">
            No messages yet. Ask the AI to help organize your board.
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={`${index}-${message.created_at ?? ""}`}
            data-testid={`chat-message-${message.role}`}
            className={clsx(
              "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
              message.role === "user"
                ? "ml-auto bg-[var(--primary-blue)] text-white"
                : "mr-auto border border-[var(--stroke)] bg-[var(--surface)] text-[var(--navy-dark)]"
            )}
          >
            <p className="whitespace-pre-wrap leading-6">{message.content}</p>
            {message.created_at && (
              <p
                className={clsx(
                  "mt-1 text-[10px] uppercase tracking-[0.15em]",
                  message.role === "user"
                    ? "text-white/70"
                    : "text-[var(--gray-text)]"
                )}
              >
                {formatTime(message.created_at)}
              </p>
            )}
          </div>
        ))}
        {sending && (
          <div
            data-testid="chat-typing"
            className="mr-auto rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--gray-text)]"
          >
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <p
          role="alert"
          data-testid="chat-error"
          className="mx-5 mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <form
        className="border-t border-[var(--stroke)] px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKey}
          rows={2}
          placeholder="Ask the AI to update your board..."
          disabled={sending}
          aria-label="Chat message"
          className="w-full resize-none rounded-2xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] disabled:opacity-60"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Enter to send, Shift+Enter for newline
          </span>
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </aside>
  );
};
