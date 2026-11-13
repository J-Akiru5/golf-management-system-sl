import { createClient } from "@supabase/supabase-js";

export interface FieldPlayer {
  name: string;
  partner: string;
  team: number | null;
  /** The group number from the system draw. */
  group: number | null;
  cls: string;
  formulaClass: string;
  frozenIndex: number | null;
  playingHandicap: number | null;
  /** The tee name stored on the registration, e.g. "Blue". */
  tee: string;
  /** The letter the scorecard uses for that tee: W, B, L (Ladies/Red) or S. */
  teeCode: string;
}

export interface FieldLookup {
  event: string;
  tournamentId: string;
  players: FieldPlayer[];
}

export class SupabaseFieldUnavailable extends Error {}

type Row = Record<string, unknown>;

function record(value: unknown): Row | null {
  if (Array.isArray(value)) return value.length > 0 ? record(value[0]) : null;
  return typeof value === "object" && value !== null ? (value as Row) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/**
 * The system's class formula: both indexes capped at 30, averaged, rounded, then A 0-12,
 * B 13-18, C 19-23, D 24+. It is used only when the stored class row is missing.
 */
export function classFromAverage(indexA: number, indexB: number): string {
  const average = (Math.min(30, indexA) + Math.min(30, indexB)) / 2;
  const rounded = Math.round(average);
  if (rounded <= 12) return "A";
  if (rounded <= 18) return "B";
  if (rounded <= 23) return "C";
  return "D";
}

export function normalizeClass(value: unknown): string {
  const raw = text(value).toUpperCase();
  if (/^[ABCD]$/.test(raw)) return raw;
  const match = raw.match(/\b(?:CLASS\s*)?([ABCD])\b/);
  return match?.[1] ?? "";
}

/**
 * The scorecard marks the tee as a letter. The desk names the same tees White, Blue, Red and
 * Silver; a ladies card is marked L and plays the Red tee.
 */
export function teeCode(value: unknown): string {
  const raw = text(value).toUpperCase();
  if (raw.startsWith("WHITE")) return "W";
  if (raw.startsWith("BLUE")) return "B";
  if (raw.startsWith("RED")) return "L";
  if (raw.startsWith("SILVER")) return "S";
  return "";
}

/**
 * Reads the live field list from Supabase. The class is the system's stored class (the flight
 * name assigned by the desk), with the formula as a fallback when a flight row is missing.
 * The service role is used because this local app has no staff session.
 */
export async function loadField(eventName: string): Promise<FieldLookup | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new SupabaseFieldUnavailable(
      "Supabase is not configured on this machine. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let tournamentQuery = supabase
    .from("tournaments")
    .select("id,club_id,name,play_date")
    .order("play_date", { ascending: false })
    .limit(8);
  if (eventName.trim()) {
    tournamentQuery = tournamentQuery.ilike("name", `%${eventName.trim()}%`);
  }
  const { data: tournamentRows, error: tournamentError } = await tournamentQuery;
  if (tournamentError) {
    throw new SupabaseFieldUnavailable(`Could not read the event list: ${tournamentError.message}`);
  }
  const tournaments = (tournamentRows ?? []) as Row[];
  if (tournaments.length === 0) return null;
  const tournament =
    tournaments.find((row) => text(row.name).toLowerCase() === eventName.trim().toLowerCase()) ??
    tournaments[0];
  if (!tournament) return null;

  const tournamentId = text(tournament.id);
  const clubId = text(tournament.club_id);
  const event = text(tournament.name);

  const { data: registrationRows, error: registrationError } = await supabase
    .from("registrations")
    .select(
      "id,player_id,frozen_index,playing_handicap,flight_id,players(full_name),flights(name),tees(name),categories(tees(name))",
    )
    .eq("tournament_id", tournamentId)
    .eq("club_id", clubId);
  if (registrationError) {
    throw new SupabaseFieldUnavailable(
      `Could not read the field list: ${registrationError.message}`,
    );
  }

  const pairByRegistration = new Map<string, { number: number; partnerRegistrationId: string }>();
  const { data: pairRows, error: pairError } = await supabase
    .from("registration_pairs")
    .select("number,registration_pair_members(registration_id,side)")
    .eq("tournament_id", tournamentId)
    .eq("club_id", clubId);
  if (!pairError) {
    for (const pair of (pairRows ?? []) as Row[]) {
      const members = Array.isArray(pair.registration_pair_members)
        ? (pair.registration_pair_members as Row[])
        : [];
      for (const member of members) {
        const registrationId = text(member.registration_id);
        if (!registrationId) continue;
        const partnerRegistrationId = members
          .map((candidate) => text(candidate.registration_id))
          .find((candidate) => candidate && candidate !== registrationId);
        if (partnerRegistrationId) {
          pairByRegistration.set(registrationId, {
            number: numberOrNull(pair.number) ?? 0,
            partnerRegistrationId,
          });
        }
      }
    }
  }

  // Group numbers are stored on `groups`, and `group_members` maps each registration to one.
  const groupNumberById = new Map<string, number>();
  const groupByRegistration = new Map<string, number>();
  const { data: groupRows, error: groupError } = await supabase
    .from("groups")
    .select("id,number")
    .eq("tournament_id", tournamentId)
    .eq("club_id", clubId);
  if (!groupError) {
    for (const row of (groupRows ?? []) as Row[]) {
      const id = text(row.id);
      const number = numberOrNull(row.number);
      if (id && number !== null) groupNumberById.set(id, number);
    }
    const groupIds = [...groupNumberById.keys()];
    if (groupIds.length > 0) {
      const { data: memberRows } = await supabase
        .from("group_members")
        .select("group_id,registration_id")
        .eq("club_id", clubId)
        .in("group_id", groupIds);
      for (const row of (memberRows ?? []) as Row[]) {
        const groupNumber = groupNumberById.get(text(row.group_id));
        const registrationId = text(row.registration_id);
        if (groupNumber !== undefined && registrationId) {
          groupByRegistration.set(registrationId, groupNumber);
        }
      }
    }
  }

  const registrations = (registrationRows ?? []) as Row[];
  const byId = new Map<
    string,
    {
      name: string;
      index: number | null;
      flightClass: string;
      playingHandicap: number | null;
      tee: string;
    }
  >();
  for (const row of registrations) {
    const id = text(row.id);
    const player = record(row.players);
    const flight = record(row.flights);
    const name = text(player?.full_name);
    if (!id || !name) continue;
    // The registration carries the tee the desk assigned. Older rows can be missing it, so the
    // category tee is the fallback; the card's own letter is never used to fill the system value.
    const registrationTee = record(row.tees);
    const categoryTee = record(record(row.categories)?.tees);
    byId.set(id, {
      name,
      index: numberOrNull(row.frozen_index),
      flightClass: normalizeClass(flight?.name),
      playingHandicap: numberOrNull(row.playing_handicap),
      tee: text(registrationTee?.name) || text(categoryTee?.name),
    });
  }

  const players: FieldPlayer[] = [];
  for (const [id, entry] of byId) {
    const pair = pairByRegistration.get(id);
    const partner = pair ? (byId.get(pair.partnerRegistrationId)?.name ?? "") : "";
    const partnerIndex = pair ? (byId.get(pair.partnerRegistrationId)?.index ?? null) : null;
    const formulaClass =
      entry.index !== null && partnerIndex !== null
        ? classFromAverage(entry.index, partnerIndex)
        : "";
    players.push({
      name: entry.name,
      partner,
      team: pair ? pair.number : null,
      group: groupByRegistration.get(id) ?? null,
      cls: entry.flightClass || formulaClass,
      formulaClass,
      frozenIndex: entry.index,
      playingHandicap: entry.playingHandicap,
      tee: entry.tee,
      teeCode: teeCode(entry.tee),
    });
  }
  players.sort((left, right) => left.name.localeCompare(right.name));
  return { event, tournamentId, players };
}
