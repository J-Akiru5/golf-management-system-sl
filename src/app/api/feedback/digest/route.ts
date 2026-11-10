import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { DeskAccessError, getDeskMember } from "@/lib/auth/member";
import { isFeedbackCategory } from "@/lib/data/feedback";
import {
  buildFeedbackDigest,
  type FeedbackDigestNote,
  feedbackDigestDedupeKey,
} from "@/lib/data/feedback-digest";
import { mailChannelConfigured } from "@/lib/email/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

const MAX_DIGEST_NOTES = 25;

const NOT_CONFIGURED =
  "Email is not configured. Add RESEND_API_KEY and EMAIL_FROM to the server environment. The inbox still works without a digest.";
const MISSING_FEEDBACK =
  "The feedback inbox is not ready yet. The feedback follow-up migration has not been applied. Nothing was queued.";
const MISSING_OUTBOX =
  "The email outbox is not available yet. Migration 20261040000000 has not been applied. Nothing was queued.";
const MISSING_DIGEST_KIND =
  "The email outbox does not accept the feedback digest kind yet. Migration 20261110000300 has not been applied. Nothing was queued.";
const ROLE_REFUSED = "Only an owner or organizer can queue a feedback digest.";

function isMissingRelation(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|schema cache/i.test(error.message ?? "")
  );
}

function json(
  body: { configured: boolean; queued: boolean; message: string },
  status = 200,
): NextResponse {
  return NextResponse.json(body, { status });
}

async function mostRecentTournamentId(
  client: SupabaseClient<Database>,
  clubId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("tournaments")
    .select("id")
    .eq("club_id", clubId)
    .order("play_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return null;
  return data?.[0]?.id ?? null;
}

/**
 * Queue one private digest of current new/planned feedback.
 *
 * The route is a signed-in staff action. It resolves the club server-side, never trusts a club id
 * from the browser, and inserts a queued outbox row only when the mail channel is configured. A
 * queued row is not a delivery claim; /api/email/send records the provider answer.
 */
export async function POST() {
  const client = await createSupabaseServerClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return json(
      { configured: false, queued: false, message: "Sign in to queue a feedback digest." },
      401,
    );
  }

  let member: Awaited<ReturnType<typeof getDeskMember>>;
  try {
    member = await getDeskMember(client, userData.user.id);
  } catch (accessError) {
    if (accessError instanceof DeskAccessError) {
      return json(
        {
          configured: mailChannelConfigured(),
          queued: false,
          message: "This account is not a member of a club.",
        },
        403,
      );
    }
    return json(
      {
        configured: mailChannelConfigured(),
        queued: false,
        message: "The club membership could not be checked. Nothing was queued.",
      },
      500,
    );
  }

  const configured = mailChannelConfigured();
  if (!configured) {
    return json({ configured: false, queued: false, message: NOT_CONFIGURED });
  }

  if (member.role !== "owner" && member.role !== "organizer") {
    return json({ configured: true, queued: false, message: ROLE_REFUSED }, 403);
  }

  const recipientEmail = userData.user.email?.trim();
  if (!recipientEmail) {
    return json({
      configured: true,
      queued: false,
      message: "The signed-in account has no email address. Nothing was queued.",
    });
  }

  const { data: rows, error: readError } = await client
    .from("public_feedback")
    .select("id, category, message, status, tournament_id, created_at")
    .eq("club_id", member.clubId)
    .in("status", ["new", "planned"])
    .order("created_at", { ascending: false })
    .limit(MAX_DIGEST_NOTES);

  if (readError) {
    if (isMissingRelation(readError)) {
      return json({ configured: true, queued: false, message: MISSING_FEEDBACK });
    }
    return json({
      configured: true,
      queued: false,
      message: "The feedback inbox could not be read. Nothing was queued.",
    });
  }

  const notes: FeedbackDigestNote[] = [];
  let eventId: string | null = null;
  for (const row of rows ?? []) {
    if (eventId === null && typeof row.tournament_id === "string") {
      eventId = row.tournament_id;
    }
    if (!isFeedbackCategory(row.category)) continue;
    if (row.status !== "new" && row.status !== "planned") continue;
    notes.push({
      category: row.category,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
    });
  }

  const day = new Date().toISOString().slice(0, 10);
  const digest = buildFeedbackDigest(notes, { day });
  if (!digest) {
    return json({
      configured: true,
      queued: false,
      message: "There are no new or planned notes to summarise.",
    });
  }

  // The outbox needs a tournament id even when a note has no event link. Use the note's event when
  // there is one, otherwise the most recent event for the club.
  const tournamentId = eventId ?? (await mostRecentTournamentId(client, member.clubId));
  if (!tournamentId) {
    return json({
      configured: true,
      queued: false,
      message: "Create an event before queueing a feedback digest. Nothing was queued.",
    });
  }

  const { data: inserted, error: insertError } = await client
    .from("email_outbox")
    .upsert(
      {
        club_id: member.clubId,
        tournament_id: tournamentId,
        registration_id: null,
        recipient_email: recipientEmail,
        recipient_name: member.displayName || recipientEmail,
        kind: "feedback_digest",
        subject: digest.subject,
        body: digest.body,
        status: "queued",
        dedupe_key: feedbackDigestDedupeKey(member.clubId, day),
      },
      { onConflict: "club_id,dedupe_key", ignoreDuplicates: true },
    )
    .select("id");

  if (insertError) {
    if (isMissingRelation(insertError)) {
      return json({ configured: true, queued: false, message: MISSING_OUTBOX });
    }
    if (insertError.code === "23514") {
      return json({ configured: true, queued: false, message: MISSING_DIGEST_KIND });
    }
    if (insertError.code === "42501") {
      return json({ configured: true, queued: false, message: ROLE_REFUSED }, 403);
    }
    return json({
      configured: true,
      queued: false,
      message: "The digest could not be queued. Nothing was sent.",
    });
  }

  const queued = (inserted?.length ?? 0) > 0;
  return json({
    configured: true,
    queued,
    message: queued
      ? `Queued one feedback digest for ${recipientEmail}. Delivery depends on the mail sender; this is not a delivery claim.`
      : "A feedback digest is already queued for today.",
  });
}
