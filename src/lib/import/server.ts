import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type DeskMember, getDeskMember } from "@/lib/auth/member";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { ExistingPlayerRef, ExistingRegistrationRef, TournamentDayRef } from "./types";

export type ImportSession =
  | {
      ok: true;
      client: SupabaseClient<Database>;
      userId: string;
      member: DeskMember;
    }
  | { ok: false; status: number; message: string };

export async function importSession(): Promise<ImportSession> {
  let client: SupabaseClient<Database>;
  try {
    client = await createSupabaseServerClient();
  } catch {
    return { ok: false, status: 503, message: "Supabase is not configured for this deployment." };
  }
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return { ok: false, status: 401, message: "Sign in to import a workbook." };
  }
  try {
    const member = await getDeskMember(client, data.user.id);
    if (member.role !== "owner" && member.role !== "organizer") {
      return {
        ok: false,
        status: 403,
        message: "Only an owner or organizer can import registrations.",
      };
    }
    return { ok: true, client, userId: data.user.id, member };
  } catch (e) {
    return {
      ok: false,
      status: 403,
      message: e instanceof Error ? e.message : "This account cannot use the desk.",
    };
  }
}

export interface TournamentImportContext {
  tournamentId: string;
  tournamentName: string;
  cutoffDate: string;
  days: TournamentDayRef[];
  dayRule: { required: number | null; max: number | null };
  schemaReady: boolean;
  schemaProblems: string[];
  existingPlayers: ExistingPlayerRef[];
  existingRegistrations: ExistingRegistrationRef[];
}

function missingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST205" ||
    /does not exist|schema cache|column .* not found/i.test(error.message ?? "")
  );
}

function fallbackDays(
  dates: string[] | null,
  playDate: string,
  firstTeeTime: string,
): TournamentDayRef[] {
  const list = (dates && dates.length ? dates : [playDate]).filter(Boolean);
  return list.map((date, index) => ({
    dayNumber: index + 1,
    playDate: date,
    label: `Day ${index + 1}`,
    startTime: index === 0 ? firstTeeTime.slice(0, 5) : null,
    isPlayingDay: true,
  }));
}

/**
 * Reads the event, its days and the players the import has to match against. Every optional
 * object is feature-detected: a database that has not applied 20261037000000 still shows a usable
 * preview against the old `dates` array, but `schemaReady` is false and the commit is refused.
 */
export async function loadTournamentImportContext(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
): Promise<{ ok: true; context: TournamentImportContext } | { ok: false; message: string }> {
  const { data: tournament, error } = await client
    .from("tournaments")
    .select("id, name, dates, play_date, cutoff_date, first_tee_time")
    .eq("club_id", clubId)
    .eq("id", tournamentId)
    .maybeSingle();

  if (error && !missingRelation(error)) {
    return { ok: false, message: `Could not read the event: ${error.message}` };
  }
  if (!tournament) return { ok: false, message: "That event was not found in this club." };

  const schemaProblems: string[] = [];
  let days: TournamentDayRef[] = [];
  let schemaReady = true;

  const dayResult = await client
    .from("tournament_days")
    .select("day_number, play_date, label, start_time, is_playing_day")
    .eq("club_id", clubId)
    .eq("tournament_id", tournamentId)
    .eq("is_playing_day", true)
    .order("day_number");

  if (dayResult.error) {
    if (!missingRelation(dayResult.error)) {
      return { ok: false, message: `Could not read the event days: ${dayResult.error.message}` };
    }
    schemaReady = false;
    schemaProblems.push("The structured day table is not applied yet (migration 20261037000000).");
    days = fallbackDays(tournament.dates, tournament.play_date, tournament.first_tee_time);
  } else {
    days = (dayResult.data ?? []).map((row) => ({
      dayNumber: row.day_number,
      playDate: row.play_date,
      label: row.label,
      startTime: row.start_time ? row.start_time.slice(0, 5) : null,
      isPlayingDay: row.is_playing_day,
    }));
    if (!days.length) {
      days = fallbackDays(tournament.dates, tournament.play_date, tournament.first_tee_time);
      schemaReady = false;
      schemaProblems.push(
        "The event has no day rows; save the event dates before committing an import.",
      );
    }
  }

  const { data: players, error: playerError } = await client
    .from("players")
    .select("id, full_name, ngap_id, birthdate, gender, phone, email")
    .eq("club_id", clubId)
    .order("full_name");

  if (playerError) {
    return { ok: false, message: `Could not read the player directory: ${playerError.message}` };
  }

  const { data: entries, error: entryError } = await client
    .from("registrations")
    .select("id, player_id")
    .eq("club_id", clubId)
    .eq("tournament_id", tournamentId);

  if (entryError) {
    return { ok: false, message: `Could not read the registrations: ${entryError.message}` };
  }

  const { data: rule, error: ruleError } = await client
    .from("tournaments")
    .select("required_days, max_days")
    .eq("id", tournamentId)
    .limit(1)
    .maybeSingle();
  if (ruleError && missingRelation(ruleError)) {
    schemaReady = false;
    schemaProblems.push("The per-event day rule columns are not applied yet.");
  }

  return {
    ok: true,
    context: {
      tournamentId,
      tournamentName: tournament.name,
      cutoffDate: tournament.cutoff_date,
      days,
      dayRule: {
        required: schemaReady ? (rule?.required_days ?? null) : null,
        max: schemaReady ? (rule?.max_days ?? null) : null,
      },
      schemaReady,
      schemaProblems,
      existingPlayers: (players ?? []).map((row) => ({
        id: row.id,
        name: row.full_name,
        ngapId: row.ngap_id,
        birthdate: row.birthdate,
        gender: row.gender,
        contactNumber: row.phone,
        email: row.email,
      })),
      existingRegistrations: (entries ?? []).map((row) => ({
        id: row.id,
        playerId: row.player_id,
      })),
    },
  };
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function safeUploadName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "upload";
}

/**
 * Stores the exact bytes that produced the preview. The database stores the path; the bucket is
 * private and the object is immutable from the desk. A missing bucket is reported, not hidden.
 */
export async function storeOriginalUpload(
  client: SupabaseClient<Database>,
  clubId: string,
  sha: string,
  fileName: string,
  buffer: Buffer,
): Promise<{ path: string | null; warning: string | null }> {
  const path = `${clubId}/${sha}/${safeUploadName(fileName)}`;
  const contentType = fileName.toLowerCase().endsWith(".xlsx")
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "text/csv";
  const { error } = await client.storage
    .from("registration-imports")
    .upload(path, buffer, { contentType, upsert: false });
  if (!error) return { path, warning: null };
  if (/already exists|duplicate/i.test(error.message)) return { path, warning: null };
  if (/bucket not found|not found/i.test(error.message)) {
    return {
      path: null,
      warning:
        "The original file could not be stored because the private import bucket is not set up. Apply migration 20261037000000 before committing.",
    };
  }
  return { path: null, warning: `The original file could not be stored: ${error.message}` };
}

/** A small, non-PII value shape per header for the AI mapping request. */
export function shapesForHeaders(headers: string[], rows: string[][]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  headers.forEach((header, index) => {
    const shapes = rows
      .slice(0, 5)
      .map((row) => row[index] ?? "")
      .filter(Boolean)
      .map((value) => {
        const text = value.trim();
        if (!text) return "empty";
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return "date";
        if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text)) return "date";
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "email";
        if (/^[+]?[\d\s()-]{7,}$/.test(text)) return "phone";
        if (/^[+-]?\d{1,2}(\.\d{1,2})?$/.test(text)) return "number";
        if (text.length <= 3) return "short";
        return "text";
      });
    result[header] = [...new Set(shapes)];
  });
  return result;
}
