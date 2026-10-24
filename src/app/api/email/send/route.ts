import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EmailOutboxRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

interface ResendResponse {
  id?: string;
  message?: string;
}

export async function POST(request: Request) {
  const client = await createSupabaseServerClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ message: "Sign in to send emails." }, { status: 401 });
  }

  let body: { tournamentId?: unknown };
  try {
    body = (await request.json()) as { tournamentId?: unknown };
  } catch {
    return NextResponse.json({ message: "The request was not valid JSON." }, { status: 400 });
  }
  if (typeof body.tournamentId !== "string" || !body.tournamentId) {
    return NextResponse.json({ message: "Choose an event first." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    return NextResponse.json({
      configured: false,
      sent: 0,
      failed: 0,
      message:
        "Email sending is not configured. Add RESEND_API_KEY and EMAIL_FROM to the server environment. Queued drafts remain saved.",
    });
  }

  const { data, error } = await client
    .from("email_outbox")
    .select("*")
    .eq("tournament_id", body.tournamentId)
    .eq("status", "queued")
    .order("created_at")
    .limit(50);
  if (error) {
    return NextResponse.json(
      {
        configured: true,
        sent: 0,
        failed: 0,
        message:
          error.code === "42P01"
            ? "Email reminders need migration 20261040000000."
            : `Could not read the email queue: ${error.message}`,
      },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as EmailOutboxRow[];
  let sent = 0;
  let failed = 0;
  let stopMessage: string | undefined;
  for (const row of rows) {
    // Claim the row atomically. Two tabs or a retry cannot send the same draft twice.
    const { data: claimed } = await client
      .from("email_outbox")
      .update({ status: "sending" })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [row.recipient_email],
          subject: row.subject,
          text: row.body,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = (await response.json().catch(() => null)) as ResendResponse | null;
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        // Configuration/quota failures affect the whole batch. Leave these rows queued so the
        // organizer can fix the key or domain and retry; do not burn them as failed.
        await client
          .from("email_outbox")
          .update({ status: "queued", error: null })
          .eq("id", row.id);
        stopMessage = result?.message ?? `The email provider returned ${response.status}.`;
        break;
      }
      if (!response.ok || !result?.id) {
        throw new Error(result?.message ?? `The email provider returned ${response.status}.`);
      }
      await client
        .from("email_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: result.id,
          error: null,
        })
        .eq("id", row.id);
      sent += 1;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Email delivery failed.";
      await client
        .from("email_outbox")
        .update({ status: "failed", error: message.slice(0, 500) })
        .eq("id", row.id);
      failed += 1;
    }
  }

  return NextResponse.json({ configured: true, sent, failed, message: stopMessage });
}
