import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EmailOutboxMessage,
  EmailQueueResult,
  EmailRepository,
  EmailSendResult,
} from "@/lib/data/email";
import { toEmailOutboxMessage } from "@/lib/data/email";
import { confirmationEmail, reminderEmail } from "@/lib/email/templates";
import type { DeskState } from "@/lib/store/state";
import type { Database, EmailOutboxRow } from "@/lib/supabase/types";

export function createSupabaseEmailRepository(
  client: SupabaseClient<Database>,
  state: DeskState,
  clubId: string,
): EmailRepository {
  const list = async (tournamentId: string): Promise<EmailOutboxMessage[]> => {
    const { data, error } = await client
      .from("email_outbox")
      .select("*")
      .eq("club_id", clubId)
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) {
        throw new Error("Email reminders need migration 20261040000000. Nothing was sent.");
      }
      throw new Error(`Could not load email drafts: ${error.message}`);
    }
    return (data ?? []).map(toEmailOutboxMessage);
  };

  const queue = async (
    tournamentId: string,
    kind: "confirmation" | "reminder",
  ): Promise<EmailQueueResult> => {
    const tournament = state.tournaments.find((t) => t.id === tournamentId);
    if (!tournament) throw new Error("That event was not found.");
    const playerById = new Map(state.players.map((player) => [player.id, player]));
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ?? "";
    const rows = state.entries
      .filter((entry) => entry.tournamentId === tournamentId)
      .flatMap((entry) => {
        const player = playerById.get(entry.playerId);
        const email = player?.email?.trim();
        if (!player || !email) return [];
        const draft =
          kind === "confirmation"
            ? confirmationEmail(tournament, player.name, siteUrl)
            : reminderEmail(tournament, player.name, siteUrl);
        return [
          {
            club_id: clubId,
            tournament_id: tournamentId,
            registration_id: entry.id,
            recipient_email: email,
            recipient_name: player.name,
            kind,
            subject: draft.subject,
            body: draft.body,
            status: "queued" as const,
            dedupe_key:
              kind === "confirmation"
                ? `confirmation:${entry.id}`
                : `reminder:${entry.id}:${tournament.cutOffDate}`,
          },
        ];
      });
    if (!rows.length) {
      return { queued: 0, skipped: 0, message: "No registered player has an email address." };
    }
    const { data, error } = await client
      .from("email_outbox")
      .upsert(rows, { onConflict: "club_id,dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) {
      if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) {
        throw new Error("Email reminders need migration 20261040000000. Nothing was queued.");
      }
      throw new Error(`Could not queue email drafts: ${error.message}`);
    }
    return { queued: data?.length ?? 0, skipped: rows.length - (data?.length ?? 0) };
  };

  const sendQueued = async (tournamentId: string): Promise<EmailSendResult> => {
    const response = await fetch("/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId }),
    });
    const result = (await response.json().catch(() => null)) as EmailSendResult | null;
    if (!response.ok) {
      throw new Error(result?.message ?? `The email request failed (${response.status}).`);
    }
    return (
      result ?? {
        configured: false,
        sent: 0,
        failed: 0,
        message: "The email service returned no result.",
      }
    );
  };

  return { list, queue, sendQueued };
}
