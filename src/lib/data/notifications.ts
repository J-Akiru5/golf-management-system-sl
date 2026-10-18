/**
 * Reading and syncing the desk's stored alerts.
 *
 * The bell is a pointer, not the source of truth: draw rules stay in `validateDraw`. This module
 * only handles the notifications table and the two functions that maintain it.
 *
 * Every call is club-scoped and relies on RLS rather than bypassing it. `sync_notifications` and
 * `mark_notifications_read` are SECURITY DEFINER, so a desk member can run them without any write
 * policy on the tables themselves.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredNotification } from "@/components/notifications/alerts";
import type { Database } from "@/lib/supabase/types";

export async function loadNotifications(
  client: SupabaseClient<Database>,
  tournamentId: string,
): Promise<StoredNotification[]> {
  const [open, reads] = await Promise.all([
    client
      .from("notifications")
      .select("id, kind, severity, title, detail")
      .eq("tournament_id", tournamentId)
      .is("resolved_at", null)
      .order("created_at"),
    // RLS returns only the caller's own read rows, so there is no user filter to forget here.
    client.from("notification_reads").select("notification_id"),
  ]);

  if (open.error) throw new Error(`Could not load alerts: ${open.error.message}`);
  if (reads.error) throw new Error(`Could not load alert read state: ${reads.error.message}`);

  const read = new Set((reads.data ?? []).map((row) => row.notification_id));
  return (open.data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    severity: row.severity,
    title: row.title,
    detail: row.detail,
    read: read.has(row.id),
  }));
}

/** Recomputes the alerts the data implies. Returns how many are outstanding. */
export async function syncNotifications(
  client: SupabaseClient<Database>,
  tournamentId: string,
): Promise<number> {
  const { data, error } = await client.rpc("sync_notifications", { p_tournament: tournamentId });
  if (error) throw new Error(`Could not check alerts: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

/** Marks the outstanding alerts as read for the caller. Returns how many rows that touched. */
export async function markNotificationsRead(
  client: SupabaseClient<Database>,
  tournamentId: string,
): Promise<number> {
  const { data, error } = await client.rpc("mark_notifications_read", {
    p_tournament: tournamentId,
  });
  if (error) throw new Error(`Could not dismiss notices: ${error.message}`);
  return typeof data === "number" ? data : 0;
}
