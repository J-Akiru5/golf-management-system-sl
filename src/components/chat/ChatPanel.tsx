"use client";

import { Globe2, SendHorizontal, X } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  CHAT_COPY,
  CHAT_LOCALE_LABELS,
  CHAT_LOCALES,
  type ChatLocale,
  chatCopy,
  chatLocaleFromAppLocale,
  declinedLine,
  isChatLocale,
} from "@/lib/chat/copy";
import {
  type ConcernDraft,
  type ConcernSummaryRow,
  isConcernDraftComplete,
  toConcernPayload,
} from "@/lib/chat/draft";
import { parseConcernChatEvent } from "@/lib/chat/events";
import { MASCOT_NAME } from "@/lib/chat/mascot";
import { CHAT_MAX_TURNS, CHAT_MESSAGE_MAX } from "@/lib/chat/prompt";
import { framePayloads, takeSseFrames } from "@/lib/chat/sse";
import { useI18n } from "@/lib/i18n/context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  CHAT_STORAGE_MESSAGES_MAX,
  type ChatSessionMessage,
  loadChatSession,
  newConversationId,
  saveChatSession,
} from "./chat-storage";
import "./chat.css";
import { TeeoAvatar } from "./TeeoAvatar";

type Status = "idle" | "thinking" | "sending";

interface Notice {
  tone: "ok" | "bad";
  text: string;
}

/**
 * The concern chat panel, loaded only when a player opens the launcher.
 *
 * The browser never decides what the note says: it sends the conversation, shows the reply and the
 * summary the route returns, and sends the draft back for confirmation. The database is not
 * reachable from here; the two API routes are the only writes. A reload keeps the conversation from
 * `sessionStorage`.
 */
export function ChatPanel({ onClose }: { onClose: () => void }) {
  const { locale: appLocale } = useI18n();
  const [stored] = useState(() => loadChatSession());
  const [conversationId] = useState(() => stored?.conversationId ?? newConversationId());
  const [language, setLanguage] = useState<ChatLocale>(
    () => stored?.language ?? chatLocaleFromAppLocale(appLocale),
  );
  const [messages, setMessages] = useState<ChatSessionMessage[]>(() => {
    if (stored && stored.messages.length > 0) return stored.messages;
    return [{ role: "assistant", content: chatCopy(language).greeting }];
  });
  const [draft, setDraft] = useState<ConcernDraft | null>(stored?.draft ?? null);
  const [summary, setSummary] = useState<ConcernSummaryRow[]>(stored?.summary ?? []);
  const [complete, setComplete] = useState(stored?.complete ?? false);
  const [fallback, setFallback] = useState(stored?.fallback ?? false);
  const [sent, setSent] = useState(stored?.sent ?? false);
  const [status, setStatus] = useState<Status>("idle");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [input, setInput] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const copy = chatCopy(language);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const atTurnLimit = messages.length >= CHAT_MAX_TURNS;
  const busy = status !== "idle";
  // A restored session can hold `complete` without a draft if the stored draft was unreadable; the
  // composer stays available in that case so the player is never stuck.
  const showComposer = !sent && (!complete || draft === null);
  const showQuickReplies = showComposer && !messages.some((message) => message.role === "user");

  useEffect(() => {
    inputRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    saveChatSession({
      conversationId,
      language,
      messages,
      draft,
      summary,
      complete,
      fallback,
      sent,
    });
  }, [conversationId, language, messages, draft, summary, complete, fallback, sent]);

  // Newest message stays in view, including while a reply is being appended.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, status, complete, notice]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "48px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 108)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 108 ? "auto" : "hidden";
  }, [input]);

  function handleLanguage(next: ChatLocale) {
    setLanguage(next);
    setNotice(null);
    if (messages.length <= 1) {
      setMessages([{ role: "assistant", content: CHAT_COPY[next].greeting }]);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    onClose();
  }

  function applyEvent(
    event: ReturnType<typeof parseConcernChatEvent>,
    append: (text: string) => void,
  ) {
    if (!event) return;
    switch (event.type) {
      case "meta":
        setFallback(event.fallback);
        if (isChatLocale(event.language) && event.language !== language) {
          setLanguage(event.language);
        }
        break;
      case "delta":
        append(event.text);
        break;
      case "draft":
        setDraft(event.draft);
        setSummary(event.summary);
        setComplete(event.complete);
        break;
      case "done":
        setFallback(event.fallback);
        break;
      case "error":
        setNotice({ tone: "bad", text: event.message });
        break;
    }
  }

  async function send(text: string) {
    const content = text.trim().slice(0, CHAT_MESSAGE_MAX);
    if (content === "" || busy || sent || atTurnLimit) return;

    const history: ChatSessionMessage[] = [...messages, { role: "user", content }];
    setMessages(history);
    setInput("");
    setNotice(null);
    setFallback(false);
    setStatus("thinking");

    const controller = new AbortController();
    abortRef.current = controller;

    let reply = "";
    let placed = false;

    const append = (chunk: string) => {
      if (chunk === "") return;
      if (!placed) {
        placed = true;
        reply = chunk;
        setMessages((previous) => [...previous, { role: "assistant", content: reply }]);
        return;
      }
      reply += chunk;
      setMessages((previous) => {
        const next = [...previous];
        next[next.length - 1] = { role: "assistant", content: reply };
        return next;
      });
    };

    try {
      const response = await fetch("/api/chat/concern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          language,
          conversationId,
          declined: draft?.declined ?? [],
          honeypot,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setNotice({ tone: "bad", text: payload?.message ?? copy.submitFailed });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { frames, rest } = takeSseFrames(buffer);
        buffer = rest;
        for (const frame of frames) {
          for (const payload of framePayloads(frame)) {
            applyEvent(parseConcernChatEvent(payload), append);
          }
        }
      }

      if (!placed) {
        setNotice({ tone: "bad", text: copy.submitFailed });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error("[chat] the reply could not be read", error);
        setNotice({ tone: "bad", text: copy.submitFailed });
      }
    } finally {
      abortRef.current = null;
      setStatus("idle");
    }
  }

  async function confirmSend() {
    if (!draft || !isConcernDraftComplete(draft) || busy || sent) return;
    setStatus("sending");
    setNotice(null);

    try {
      if (!isSupabaseConfigured()) {
        // The demo build has no inbox to write to. Say so instead of pretending the note arrived.
        setNotice({ tone: "bad", text: copy.notReady });
        return;
      }

      const response = await fetch("/api/chat/concern/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          details: toConcernPayload(draft),
          transcript: messages.slice(-CHAT_STORAGE_MESSAGES_MAX),
          locale: language,
          pagePath: typeof window === "undefined" ? null : window.location.pathname,
          honeypot,
          conversationId,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;

      if (response.ok && payload?.ok) {
        setSent(true);
        setComplete(false);
        return;
      }

      setNotice({ tone: "bad", text: payload?.message ?? copy.submitFailed });
    } catch (error) {
      console.error("[chat] the note could not be sent", error);
      setNotice({ tone: "bad", text: copy.submitFailed });
    } finally {
      setStatus("idle");
    }
  }

  function startEditing() {
    if (busy) return;
    setComplete(false);
    setFallback(false);
    setMessages((previous) => [...previous, { role: "assistant", content: copy.editHint }]);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  const feedbackHref =
    typeof window === "undefined"
      ? "/feedback"
      : `/feedback?from=${encodeURIComponent(window.location.pathname)}`;

  return (
    <div
      className="tl-chat-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="tl-chat-title"
      onKeyDown={handleKeyDown}
    >
      <header className="tl-chat-head">
        <TeeoAvatar size={48} variant="head" className="tl-chat-head-avatar" />
        <div className="tl-chat-head-text">
          <h2 id="tl-chat-title" className="tl-chat-name">
            {MASCOT_NAME}
          </h2>
          <p className="tl-chat-tagline">{copy.tagline}</p>
        </div>
        <label className="tl-chat-language" htmlFor="tl-chat-language">
          <Globe2 size={16} aria-hidden="true" />
          <span aria-hidden="true">{language.toUpperCase()}</span>
          <span className="tl-chat-sr">{copy.languageLabel}</span>
          <select
            id="tl-chat-language"
            value={language}
            aria-label={copy.languageLabel}
            onChange={(event) => {
              if (isChatLocale(event.target.value)) handleLanguage(event.target.value);
            }}
          >
            {CHAT_LOCALES.map((value) => (
              <option key={value} value={value}>
                {CHAT_LOCALE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="tl-chat-icon-button"
          onClick={onClose}
          aria-label={copy.closeLabel}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>

      <div className="tl-chat-log" ref={logRef} aria-live="polite" aria-relevant="additions">
        {messages.map((message, index) => (
          // The transcript is append-only and has no ids; the position is stable until it is reset.
          <div
            key={`${message.role}-${index}`}
            className="tl-chat-turn"
            data-role={message.role}
            data-avatar={
              message.role === "assistant" &&
              (index === 0 || messages[index - 1]?.role !== "assistant")
                ? "true"
                : "false"
            }
          >
            {message.role === "assistant" &&
              (index === 0 || messages[index - 1]?.role !== "assistant") && (
                <TeeoAvatar size={28} variant="head" />
              )}
            <p className="tl-chat-bubble">{message.content}</p>
          </div>
        ))}
        {status === "thinking" && messages[messages.length - 1]?.role === "user" && (
          <div className="tl-chat-turn" data-role="assistant" data-avatar="true">
            <TeeoAvatar size={28} variant="head" />
            <p className="tl-chat-bubble tl-chat-typing" role="status" aria-label={copy.sending}>
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </p>
          </div>
        )}
      </div>

      {notice && (
        <p
          className="tl-chat-notice"
          data-tone={notice.tone === "ok" ? "ok" : undefined}
          role={notice.tone === "ok" ? "status" : "alert"}
        >
          {notice.text}
        </p>
      )}

      {fallback && !sent && (
        <p className="tl-chat-notice">
          <Link className="tl-chat-fallback-button" href={feedbackHref}>
            {copy.fallbackTitle}
          </Link>
        </p>
      )}

      {complete && draft && !sent && (
        <section className="tl-chat-summary" aria-labelledby="tl-chat-summary-title">
          <h3 id="tl-chat-summary-title">{copy.summaryTitle}</h3>
          <dl>
            {summary.map((row) => (
              <Fragment key={`${row.field}-${row.label}`}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </Fragment>
            ))}
          </dl>
          {declinedLine(language, draft.declined) !== "" && (
            <p className="tl-chat-summary-note">{declinedLine(language, draft.declined)}</p>
          )}
          <p className="tl-chat-summary-note">{copy.confirmPrompt}</p>
          <div className="tl-chat-actions">
            <button type="button" className="tl-chat-button" onClick={confirmSend} disabled={busy}>
              {status === "sending" ? copy.sending : copy.confirm}
            </button>
            <button
              type="button"
              className="tl-chat-button"
              data-variant="quiet"
              onClick={startEditing}
              disabled={busy}
            >
              {copy.edit}
            </button>
          </div>
        </section>
      )}

      {atTurnLimit && !sent && (
        <p className="tl-chat-notice">
          {copy.turnLimit}{" "}
          <Link className="tl-chat-link" href={feedbackHref}>
            {copy.fallbackTitle}
          </Link>
        </p>
      )}

      {showComposer && (
        <>
          {showQuickReplies && (
            <div className="tl-chat-quick-replies" role="group" aria-label={copy.quickRepliesLabel}>
              {copy.quickReplies.map((reply) => (
                <button
                  key={reply}
                  type="button"
                  className="tl-chat-quick-reply"
                  onClick={() => void send(reply)}
                  disabled={busy || atTurnLimit}
                >
                  {reply}
                </button>
              ))}
            </div>
          )}
          <form
            className="tl-chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <label className="tl-chat-sr" htmlFor="tl-chat-input">
              {copy.placeholder}
            </label>
            <textarea
              id="tl-chat-input"
              ref={inputRef}
              value={input}
              rows={1}
              maxLength={CHAT_MESSAGE_MAX}
              placeholder={copy.placeholder}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              disabled={busy || atTurnLimit}
            />
            <button
              type="submit"
              className="tl-chat-send"
              disabled={busy || atTurnLimit || input.trim() === ""}
              aria-label={busy ? copy.sending : copy.send}
            >
              <SendHorizontal size={19} aria-hidden="true" />
            </button>
            <div className="tl-chat-honeypot" aria-hidden="true">
              <label>
                website
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(event) => setHoneypot(event.target.value)}
                />
              </label>
            </div>
          </form>
        </>
      )}

      {sent && (
        <p className="tl-chat-summary-note" role="status">
          {copy.submitSuccess}
        </p>
      )}
    </div>
  );
}
