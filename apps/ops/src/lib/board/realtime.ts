import type { WsPipelineCardRow } from "@/lib/db/types";
import type { BoardEvent } from "./merge";
import { isPipelineStage, isPricingModel } from "./validation";

/**
 * Reading the private board channel.
 *
 * `realtime.broadcast_changes` sends one message per changed row. Its payload carries the table,
 * the record and the old record; different message shapes have nested that payload one level, so
 * both are accepted. Anything malformed is dropped: the board treats events as hints and never
 * invents a card from a value it could not read.
 */

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pick(sources: ReadonlyArray<Record<string, unknown>>, keys: readonly string[]): unknown {
  for (const source of sources) {
    for (const key of keys) {
      if (key in source) return source[key];
    }
  }
  return undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

/** Read a full card row, or null when any field is missing or the wrong type. */
export function readCardRow(value: unknown): WsPipelineCardRow | null {
  const row = asObject(value);
  if (row === null) return null;

  if (!isString(row.id) || row.id === "") return null;
  if (!isString(row.title) || !isString(row.club_name)) return null;
  if (!isString(row.currency)) return null;
  if (!isString(row.created_at) || !isString(row.updated_at)) return null;
  if (typeof row.stage !== "string" || !isPipelineStage(row.stage)) return null;
  if (typeof row.position !== "number" || !Number.isFinite(row.position)) return null;
  if (!isNullableString(row.tournament_id)) return null;
  if (!isNullableString(row.start_date)) return null;
  if (!isNullableString(row.end_date)) return null;
  if (!isNullableNumber(row.expected_players)) return null;
  if (!isNullableNumber(row.quoted_amount)) return null;
  if (!isNullableString(row.owner_id)) return null;
  if (!isNullableString(row.notes)) return null;
  if (!isNullableString(row.created_by)) return null;

  const pricing = row.pricing_model;
  if (pricing !== null && (typeof pricing !== "string" || !isPricingModel(pricing))) return null;

  return {
    id: row.id,
    tournament_id: row.tournament_id,
    title: row.title,
    club_name: row.club_name,
    stage: row.stage,
    position: row.position,
    start_date: row.start_date,
    end_date: row.end_date,
    expected_players: row.expected_players,
    pricing_model: pricing,
    quoted_amount: row.quoted_amount,
    currency: row.currency,
    owner_id: row.owner_id,
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function boardEventFromBroadcast(event: string, payload: unknown): BoardEvent | null {
  const root = asObject(payload);
  if (root === null) return null;
  const inner = asObject(root.payload);
  const sources = inner === null ? [root] : [root, inner];

  if (event === "DELETE") {
    const old =
      asObject(pick(sources, ["old_record", "old"])) ?? asObject(pick(sources, ["record", "new"]));
    const id = old?.id;
    return isString(id) && id !== "" ? { kind: "delete", id } : null;
  }

  if (event === "INSERT" || event === "UPDATE") {
    const card = readCardRow(pick(sources, ["record", "new"]));
    return card === null ? null : { kind: "upsert", card };
  }

  return null;
}
