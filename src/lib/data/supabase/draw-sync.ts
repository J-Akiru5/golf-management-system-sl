import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManualOverride } from "@/lib/data/types";
import type { DrawGroup } from "@/lib/draw/validate";
import type { Published } from "@/lib/store/state";
import type { Database, Json } from "@/lib/supabase/types";

/**
 * The draw and the publish are written only through database functions (see
 * 20261022000000_versioned_publish.sql). Each save names the revision it started from, so a save
 * made from an out-of-date screen is refused instead of overwriting someone else's work.
 */

export class DrawConflictError extends Error {
  constructor() {
    super(
      "The draw was changed by someone else since this screen loaded. Reload to see their changes; your last edit was not saved.",
    );
    this.name = "DrawConflictError";
  }
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function isConflict(error: { message: string; code?: string }): boolean {
  return error.code === "40001" || error.message.includes("draw_revision_conflict");
}

export function drawToJson(draw: DrawGroup[]): Json {
  return asJson(
    draw.map((group) => ({
      number: group.number,
      flightId: group.flightId,
      startHole: group.startHole,
      wave: group.wave,
      time: group.time,
      locked: group.locked,
      playerIds: group.playerIds,
    })),
  );
}

/** Replaces the whole draw in one transaction. Returns the new revision. */
export async function saveDraw(
  client: SupabaseClient<Database>,
  tournamentId: string,
  expectedRevision: number,
  draw: DrawGroup[],
  overrides: ManualOverride[] | null,
): Promise<number> {
  const { data, error } = await client.rpc("save_draw", {
    p_tournament: tournamentId,
    p_expected_revision: expectedRevision,
    p_groups: drawToJson(draw),
    p_overrides: overrides ? asJson(overrides) : null,
  });
  if (error) {
    if (isConflict(error)) throw new DrawConflictError();
    throw new Error(`Could not save the draw: ${error.message}`);
  }
  if (typeof data !== "number") throw new Error("Could not save the draw: no revision returned.");
  return data;
}

export interface PublishResult {
  version: number;
  at: string;
}

/** Creates the next numbered version and makes it the one players see. */
export async function publishPairings(
  client: SupabaseClient<Database>,
  tournamentId: string,
  expectedRevision: number,
  published: Pick<Published, "groups" | "signature">,
  note?: string,
): Promise<PublishResult> {
  const { data, error } = await client.rpc("publish_pairings", {
    p_tournament: tournamentId,
    p_expected_revision: expectedRevision,
    p_groups: asJson(published.groups),
    p_signature: published.signature,
    p_note: note ?? null,
  });
  if (error) {
    if (isConflict(error)) throw new DrawConflictError();
    throw new Error(`Could not publish the pairings: ${error.message}`);
  }
  const result = data as { version?: unknown; at?: unknown } | null;
  if (!result || typeof result.version !== "number" || typeof result.at !== "string") {
    throw new Error("Could not publish the pairings: the response was incomplete.");
  }
  return { version: result.version, at: result.at };
}

export async function unpublishPairings(
  client: SupabaseClient<Database>,
  tournamentId: string,
): Promise<void> {
  const { error } = await client.rpc("unpublish_pairings", { p_tournament: tournamentId });
  if (error) throw new Error(`Could not unpublish the pairings: ${error.message}`);
}

/**
 * Tells the public page to refresh now instead of waiting for its cache to expire. Best effort:
 * the page still refreshes by itself within its revalidate window if this fails.
 */
export async function refreshPublicPage(client: SupabaseClient<Database>): Promise<void> {
  try {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/revalidate-pairings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // The cache expires on its own.
  }
}
