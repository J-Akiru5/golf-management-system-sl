/**
 * POST /api/chat/concern: one turn of Teeo's conversation.
 *
 * Public and signed out. Limits: 20 turns per conversation and 2000 characters per message (both
 * enforced in `src/lib/chat`), a honeypot field, a per-connection and per-conversation rate check,
 * and a daily ceiling on provider calls, all backed by the database. When a provider is configured a
 * bucket that cannot be read refuses the turn instead of allowing it: the player gets the polite
 * fallback and nothing is spent. With no provider configured there is nothing to spend, so the
 * check may be skipped. No secret ever leaves this route: a failure answers with a fixed line in
 * the player's language and no provider detail.
 *
 * The reply is one strict JSON completion, so the provider is called once and its answer is checked
 * before anything reaches the player. The route still answers with Server-Sent Events: the panel
 * reads one event stream whether the text is a model answer or the fixed fallback, and the SSE
 * frames (`meta`, `delta`, `draft`, `done`) are what the design pass can style against.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { completeAi, stableSessionId } from "@/lib/ai";
import { loadProviderConfigs } from "@/lib/ai/config";
import { withApiTiming } from "@/lib/api/timing";
import { runConcernTurn } from "@/lib/chat/conversation";
import { type ChatLocale, chatCopy, chatLocaleFromAppLocale, isChatLocale } from "@/lib/chat/copy";
import { summariseForPlayer } from "@/lib/chat/draft";
import type { ConcernChatEvent } from "@/lib/chat/events";
import {
  type ChatRateRpcClient,
  chatDailyCap,
  checkChatBudget,
  checkChatTurn,
  clientAddressFromHeaders,
  normaliseConversationId,
} from "@/lib/chat/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * The bucket client, or null when Supabase is not configured. A missing client is not a broken
 * chat: the turn gate decides whether to allow the turn (no provider configured) or refuse it.
 */
function rateClient(): ChatRateRpcClient | null {
  if (!isSupabaseConfigured()) return null;
  try {
    const client: SupabaseClient<Database> = createSupabasePublicClient();
    return client as unknown as ChatRateRpcClient;
  } catch (error) {
    console.warn("[chat] the rate limiter is unavailable", error);
    return null;
  }
}

function sseLine(event: ConcernChatEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

/** The fixed reply: no model answer, and the panel offers the tick-box form instead. */
function fallbackResponse(locale: ChatLocale, text: string, reason: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(sseLine({ type: "meta", language: locale, fallback: true, reason }));
      controller.enqueue(sseLine({ type: "delta", text }));
      controller.enqueue(sseLine({ type: "done", fallback: true }));
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

export const POST = withApiTiming("POST /api/chat/concern", async (request: NextRequest) => {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 100_000) {
    return json({ ok: false, code: "bad_request", message: chatCopy("en").badRequest }, 413);
  }

  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await request.json();
    body =
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
  } catch {
    body = null;
  }

  const locale = isChatLocale(body?.language)
    ? body.language
    : chatLocaleFromAppLocale(body?.language);
  const copy = chatCopy(locale);

  // Only the last 60 entries are kept, so a very long body cannot be turned into work. The turn
  // rule itself still counts what the conversation really had, within that window.
  const messages = Array.isArray(body?.messages) ? body.messages.slice(-60) : null;
  const last = messages?.[messages.length - 1] as { role?: unknown } | undefined;
  if (!body || !messages || messages.length === 0 || last?.role !== "user") {
    return json({ ok: false, code: "bad_request", message: copy.badRequest }, 400);
  }

  const conversationId = normaliseConversationId(body.conversationId);
  const honeypot = typeof body.honeypot === "string" ? body.honeypot.trim() : "";
  const address = clientAddressFromHeaders(request.headers);

  // A filled honeypot is a bot. It gets the ordinary greeting and no provider call, so it learns
  // nothing and costs nothing. Checked first, so a bot does not consume a real bucket.
  if (honeypot !== "") {
    return fallbackResponse(locale, copy.greeting, "honeypot");
  }

  const configs = await loadProviderConfigs();
  const providerConfigured = configs.length > 0;
  const sessionId = stableSessionId("concern", conversationId ?? address ?? "anonymous");
  const client = rateClient();

  const gate = await checkChatTurn(client, {
    address,
    conversationId,
    providerConfigured,
  });
  if (!gate.allowed) {
    if (gate.reason === "rate_limited") {
      return json({ ok: false, code: "rate_limited", message: copy.rateLimited }, 429);
    }
    // A provider is configured and the buckets cannot be read, so the turn is not spent.
    console.warn("[chat] the rate check could not run, so the turn is not spent");
    return fallbackResponse(locale, copy.fallback, "rate_check_unavailable");
  }

  const dailyCap = chatDailyCap();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ConcernChatEvent) => controller.enqueue(sseLine(event));
      try {
        const result = await runConcernTurn({
          messages: messages as { role: string; content: string }[],
          locale,
          declined: body.declined,
          sessionId,
          complete: async (turns, systemPrompt, id) => {
            if (!providerConfigured) return null;

            // The daily ceiling is charged here, once per provider call, so the count matches what
            // is actually spent. A ceiling that cannot be read refuses the call.
            const budget = await checkChatBudget(client, { providerConfigured, cap: dailyCap });
            if (!budget.allowed) {
              console.warn(
                budget.degraded
                  ? "[chat] the daily ceiling could not be read, so the turn is not spent"
                  : "[chat] the daily provider ceiling is reached",
              );
              return null;
            }

            const answer = await completeAi(turns, systemPrompt, id, { configs, json: true });
            return answer?.content ?? null;
          },
        });

        send({
          type: "meta",
          language: result.locale,
          fallback: result.fallback,
          reason: result.reason,
        });
        send({ type: "delta", text: result.reply });
        send({
          type: "draft",
          draft: result.draft,
          next: result.next,
          complete: result.complete,
          summary: summariseForPlayer(result.draft, result.locale),
          declined: result.draft.declined,
        });
        send({ type: "done", fallback: result.fallback });
      } catch (error) {
        console.error("[chat] the turn failed", error);
        send({ type: "error", message: copy.submitFailed });
        send({ type: "done", fallback: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
});
