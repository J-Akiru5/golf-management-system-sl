/**
 * One turn of the concern chat: extract, merge, decide, phrase.
 *
 * The client sends the conversation and its language; the route sends it here. The draft is rebuilt
 * from the whole conversation on every turn (the model is asked to report everything the player has
 * stated), so the route holds no state and a tampered browser cannot hand the server a note it made
 * up. What comes out is decided by this file: the model's prose is used for warmth, but the next
 * question, the completeness of the note and the fallback are all code.
 *
 * Pure apart from the injected `complete` call, which the route fills with the provider facade and
 * the tests fill with a stub. No network here.
 */

import { type AiTurn, completeAi } from "@/lib/ai";
import { type ChatLocale, chatCopy, chatLocaleFromAppLocale, isChatLocale } from "./copy";
import {
  type ConcernDraft,
  declineConcernFields,
  emptyConcernDraft,
  mergeConcernDraft,
  nextMissingField,
} from "./draft";
import { parseModelTurn } from "./extract";
import type { ConcernField } from "./fields";
import { isOptionalConcernField } from "./fields";
import {
  buildConcernSystemPrompt,
  buildConcernTurns,
  CHAT_MAX_TURNS,
  countChatTurns,
} from "./prompt";

export type ConcernCompletion = (
  turns: AiTurn[],
  systemPrompt: string,
  sessionId: string,
) => Promise<string | null>;

export type ConcernTurnReason =
  | "greeting"
  | "provider_unavailable"
  | "unparsed"
  | "turn_limit"
  | "honeypot";

export interface ConcernTurnInput {
  messages: readonly { role: string; content: string }[];
  /** The player's language; an unknown value starts in English. */
  locale: unknown;
  /**
   * Optional fields the player already declined. The panel sends what it holds so the "asked once"
   * rule survives a model that forgets to repeat a decline; a decline carries no note data, so
   * trusting this list cannot add anything to the note.
   */
  declined?: unknown;
  /** Stable for one conversation; providers that need affinity use it. */
  sessionId?: string;
  /** Injected for tests. Production uses the provider facade with the JSON contract. */
  complete?: ConcernCompletion;
}

export interface ConcernTurnResult {
  locale: ChatLocale;
  reply: string;
  draft: ConcernDraft;
  next: ConcernField | null;
  /** True when the note has everything the contract needs and can be confirmed. */
  complete: boolean;
  /** True when no model answer is being shown and the panel should offer the tick-box form. */
  fallback: boolean;
  reason: ConcernTurnReason | null;
}

const providerCompletion: ConcernCompletion = async (turns, systemPrompt, sessionId) => {
  const result = await completeAi(turns, systemPrompt, sessionId, { json: true });
  return result?.content ?? null;
};

function fallbackTurn(
  locale: ChatLocale,
  reply: string,
  reason: ConcernTurnReason,
): ConcernTurnResult {
  return {
    locale,
    reply,
    draft: emptyConcernDraft(),
    next: "concerns",
    complete: false,
    fallback: true,
    reason,
  };
}

export async function runConcernTurn(input: ConcernTurnInput): Promise<ConcernTurnResult> {
  const locale = isChatLocale(input.locale) ? input.locale : chatLocaleFromAppLocale(input.locale);
  const copy = chatCopy(locale);

  const totalTurns = countChatTurns(input.messages);
  const turns = buildConcernTurns(input.messages);
  const last = turns[turns.length - 1];

  if (!last || last.role !== "user") {
    return {
      locale,
      reply: copy.greeting,
      draft: emptyConcernDraft(),
      next: "concerns",
      complete: false,
      fallback: false,
      reason: "greeting",
    };
  }

  if (totalTurns >= CHAT_MAX_TURNS) {
    return fallbackTurn(locale, copy.turnLimit, "turn_limit");
  }

  const complete = input.complete ?? providerCompletion;
  let raw: string | null = null;
  try {
    raw = await complete(turns, buildConcernSystemPrompt(locale), input.sessionId ?? "");
  } catch (error) {
    console.error("[chat] the provider call failed", error);
    raw = null;
  }

  if (raw === null) {
    return fallbackTurn(locale, copy.fallback, "provider_unavailable");
  }

  const parsed = parseModelTurn(raw);
  if (!parsed) return fallbackTurn(locale, copy.fallback, "unparsed");

  const spoke = parsed.language ?? locale;
  const answerCopy = chatCopy(spoke);

  const alreadyDeclined = Array.isArray(input.declined)
    ? input.declined.filter(isOptionalConcernField)
    : [];

  let draft = mergeConcernDraft(emptyConcernDraft(), parsed.patch);
  draft = declineConcernFields(draft, [...alreadyDeclined, ...parsed.declined]);

  const next = nextMissingField(draft);
  const done = next === null;

  let reply = parsed.reply;
  if (reply === "") {
    reply = done || next === null ? answerCopy.readyToSend : answerCopy.questions[next];
  } else if (!done && next !== null && !reply.includes("?")) {
    // The model wrote a statement, not a question. Add the question the state machine needs, in the
    // same language, rather than letting the conversation stall.
    reply = `${reply} ${answerCopy.questions[next]}`;
  }

  return {
    locale: spoke,
    reply,
    draft,
    next,
    complete: done,
    fallback: false,
    reason: null,
  };
}
