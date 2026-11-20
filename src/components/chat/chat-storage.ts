/**
 * The concern chat's conversation survives a reload.
 *
 * `sessionStorage`, not `localStorage`: the note is one player's and one conversation's, and a
 * borrowed phone should not keep it after the tab is closed. The stored shape is the panel's, not
 * the database's, and it is validated on the way back in so an old or edited entry cannot break the
 * panel.
 *
 * The last 40 messages are kept, which is the contract's transcript cap and the same window the
 * route sends to a provider.
 */

import { CHAT_LOCALES, type ChatLocale, isChatLocale } from "@/lib/chat/copy";
import type { ConcernDraft, ConcernSummaryRow } from "@/lib/chat/draft";

export const CHAT_STORAGE_KEY = "teeline.chat.concern.v1";
export const CHAT_STORAGE_MESSAGES_MAX = 40;

export interface ChatSessionMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSession {
  conversationId: string;
  language: ChatLocale;
  messages: ChatSessionMessage[];
  draft: ConcernDraft | null;
  summary: ConcernSummaryRow[];
  complete: boolean;
  fallback: boolean;
  sent: boolean;
}

/** `crypto.randomUUID` needs a secure context; a phone preview over plain http does not have one. */
export function newConversationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isMessage(value: unknown): value is ChatSessionMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim() !== ""
  );
}

function isDraft(value: unknown): value is ConcernDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  return Array.isArray(draft.concerns) && Array.isArray(draft.declined);
}

function isSummary(value: unknown): value is ConcernSummaryRow[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as ConcernSummaryRow).label === "string" &&
        typeof (row as ConcernSummaryRow).value === "string",
    )
  );
}

export function loadChatSession(): ChatSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const stored = parsed as Record<string, unknown>;
    const conversationId = typeof stored.conversationId === "string" ? stored.conversationId : "";
    if (!/^[A-Za-z0-9-]{8,64}$/.test(conversationId)) return null;
    const language = isChatLocale(stored.language) ? stored.language : CHAT_LOCALES[0];
    const messages = Array.isArray(stored.messages)
      ? stored.messages.filter(isMessage).slice(-CHAT_STORAGE_MESSAGES_MAX)
      : [];
    return {
      conversationId,
      language,
      messages,
      draft: isDraft(stored.draft) ? (stored.draft as ConcernDraft) : null,
      summary: isSummary(stored.summary) ? (stored.summary as ConcernSummaryRow[]) : [],
      complete: stored.complete === true,
      fallback: stored.fallback === true,
      sent: stored.sent === true,
    };
  } catch {
    return null;
  }
}

export function saveChatSession(session: ChatSession): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      CHAT_STORAGE_KEY,
      JSON.stringify({
        ...session,
        messages: session.messages.slice(-CHAT_STORAGE_MESSAGES_MAX),
      }),
    );
  } catch {
    // Storage off or full: the panel keeps working in memory for this page.
  }
}
