/**
 * POST /api/chat/concern/submit: file the note the player confirmed.
 *
 * The draft is validated again with `normaliseConcern`, because the browser is not trusted with a
 * note it assembled. The result is neutral: a player is told the note was sent, and no row, id or
 * database message comes back. Contact details are not part of a chat note: the chat never asks for
 * an email address, so the note is filed without one.
 */

import type { NextRequest } from "next/server";
import { withApiTiming } from "@/lib/api/timing";
import { chatCopy, chatLocaleFromAppLocale, isChatLocale } from "@/lib/chat/copy";
import {
  CHAT_SUBMIT_POLICY,
  type ChatRateRpcClient,
  chatRateKey,
  checkChatRateLimit,
  clientAddressFromHeaders,
} from "@/lib/chat/rate-limit";
import {
  type ConcernSubmitRpcClient,
  prepareConcernSubmission,
  submitConcernNote,
} from "@/lib/chat/submit";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export const POST = withApiTiming("POST /api/chat/concern/submit", async (request: NextRequest) => {
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

  const locale = isChatLocale(body?.locale) ? body.locale : chatLocaleFromAppLocale(body?.locale);
  const copy = chatCopy(locale);

  if (!body) return json({ ok: false, code: "bad_request", message: copy.badRequest }, 400);

  if (!isSupabaseConfigured()) {
    return json({ ok: false, code: "not_configured", message: copy.notReady }, 503);
  }

  let client: ConcernSubmitRpcClient & ChatRateRpcClient;
  try {
    client = createSupabasePublicClient() as unknown as ConcernSubmitRpcClient & ChatRateRpcClient;
  } catch (error) {
    console.error("[chat] the public client could not be created", error);
    return json({ ok: false, code: "not_configured", message: copy.notReady }, 503);
  }

  const address = clientAddressFromHeaders(request.headers);
  const ipKey = await chatRateKey("ip", address ?? "no-address");
  const rate = await checkChatRateLimit(client, ipKey, CHAT_SUBMIT_POLICY);
  if (!rate.allowed) {
    return json({ ok: false, code: "rate_limited", message: copy.rateLimited }, 429);
  }

  const prepared = prepareConcernSubmission({
    details: body.details,
    transcript: body.transcript,
    locale,
    pagePath: body.pagePath,
    honeypot: body.honeypot,
  });
  if (!prepared.ok) {
    return json({ ok: false, code: prepared.problem, message: copy.submitFailed }, 400);
  }

  const outcome = await submitConcernNote(client, prepared.prepared);
  if (outcome.ok) return json({ ok: true, code: "accepted", message: copy.submitSuccess }, 200);

  switch (outcome.code) {
    case "rate_limited":
      return json({ ok: false, code: "rate_limited", message: copy.rateLimited }, 429);
    case "not_ready":
      return json({ ok: false, code: "not_ready", message: copy.notReady }, 503);
    case "invalid":
      return json({ ok: false, code: "invalid", message: copy.submitFailed }, 400);
    default:
      return json({ ok: false, code: "error", message: copy.submitFailed }, 502);
  }
});
