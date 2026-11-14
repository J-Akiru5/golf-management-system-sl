import { NextResponse } from "next/server";
import { requireScorecardAccess } from "@/lib/scorecards/access";
import { type FieldLookup, type FieldPlayer, loadField } from "@/lib/scorecards/field";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CardInput {
  id?: unknown;
  playerId?: unknown;
  day?: unknown;
  session?: unknown;
  group?: unknown;
  tee?: unknown;
  hdcp?: unknown;
  written?: unknown;
  holes?: unknown;
  note?: unknown;
  markerPlayerId?: unknown;
}

interface NameOnlyInput {
  id?: unknown;
  name?: unknown;
  day?: unknown;
  session?: unknown;
}

const HOLE_VALUE = /^(?:|[0-9]{1,2}|X)$/;

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function dayNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && Number.isInteger(number)
    ? Math.trunc(number)
    : null;
}

function holesOf(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== 18) return null;
  const holes = value.map((entry) =>
    String(entry ?? "")
      .trim()
      .toUpperCase(),
  );
  return holes.every((entry) => HOLE_VALUE.test(entry)) ? holes : null;
}

function correctionsFor(card: CardInput, player: FieldPlayer): Record<string, string> {
  const corrections: Record<string, string> = {};
  const session = text(card.session);
  if (session && session !== player.session) {
    corrections.session = `${player.session || "–"} to ${session}`;
  }
  const group = text(card.group);
  if (group !== String(player.group ?? "")) {
    corrections.group = `${player.group ?? "–"} to ${group || "–"}`;
  }
  const tee = text(card.tee);
  if (tee !== player.teeCode) {
    corrections.tee = `${player.teeCode || "–"} to ${tee || "–"}`;
  }
  return corrections;
}

/**
 * Freezes the cards a tabulator has checked for the admin's scoring queue.
 *
 * This route does not approve or publish anything. A tabulation account is not club staff, so the
 * staff-only scoring functions cannot be called here. The admin imports the returned submission
 * with their own session on /scores/review, approves it and publishes it.
 *
 * The player and the system handicap are read from the field, not trusted from the browser. The
 * card's written HDCP is kept as the card rule; a blank box uses the system playing handicap and
 * is marked as such. Any day, session, group or tee the tabulator corrected is kept and labelled.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const access = await requireScorecardAccess();
  if (!access.ok) {
    return NextResponse.json({ ok: false, message: access.message }, { status: access.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, message: "The submission is not valid JSON." },
      { status: 400 },
    );
  }

  const event = text(body.event);
  const label = text(body.label);
  const slug = text(body.slug);
  const submittedBy = text(body.submittedBy) || access.email || "";
  const inputs = Array.isArray(body.cards) ? (body.cards as CardInput[]) : [];
  const nameOnlyInputs = Array.isArray(body.nameOnly) ? (body.nameOnly as NameOnlyInput[]) : [];
  if (!slug || inputs.length === 0) {
    return NextResponse.json(
      { ok: false, message: "A submission needs the day document and at least one checked card." },
      { status: 400 },
    );
  }
  if (inputs.length > 300) {
    return NextResponse.json(
      { ok: false, message: "More than 300 cards in one submission. Send the day in two parts." },
      { status: 400 },
    );
  }

  const fields = new Map<number, FieldLookup | null>();
  async function fieldForDay(day: number): Promise<FieldLookup | null> {
    if (!fields.has(day)) fields.set(day, await loadField(event, { day }));
    return fields.get(day) ?? null;
  }

  const cards: Record<string, unknown>[] = [];
  const unmatched: { id: string; name: string; message: string }[] = [];
  for (const input of inputs) {
    const id = text(input.id);
    const playerId = text(input.playerId);
    const day = dayNumber(input.day);
    const holes = holesOf(input.holes);
    if (!playerId || day === null || !holes) {
      unmatched.push({
        id,
        name: text(input.holes) || id,
        message: "The card is missing its player, day or 18-hole score list.",
      });
      continue;
    }
    const field = await fieldForDay(day);
    const player = field?.players.find((entry) => entry.playerId === playerId);
    if (!field || !player) {
      unmatched.push({
        id,
        name: playerId,
        message: `The player is not in the Day ${day} field. Refresh the list from the system and send again.`,
      });
      continue;
    }
    // The desk owns the handicap. A number written on the paper card is a reading of the card, not a
    // decision: the desk's index, on the player's tee at the event's allowance, is what the card is
    // scored with. The card's own figure is kept beside it so the desk can see the difference.
    const writtenHcp = text(input.hdcp);
    const systemHcp = player.playingHandicap;
    if (systemHcp === null) {
      unmatched.push({
        id,
        name: player.name,
        message:
          "The desk has no handicap for this player. Set the index in the desk, then send the card again.",
      });
      continue;
    }
    const corrections = correctionsFor(input, player);
    const correctionNote = Object.entries(corrections)
      .map(([key, value]) => `${key} ${value}`)
      .join("; ");
    const cardHdcpNote =
      writtenHcp && writtenHcp !== String(systemHcp)
        ? `Card handicap ${writtenHcp} not used; the desk handicap ${systemHcp} scores the card.`
        : "";
    cards.push({
      id: id || `card-${playerId}`,
      playerId,
      registrationId: player.registrationId,
      name: player.name,
      day,
      session: text(input.session) || player.session,
      group: text(input.group) || (player.group !== null ? String(player.group) : ""),
      tee: text(input.tee) || player.teeCode,
      hdcp: String(systemHcp),
      handicapSource: "system",
      cardHdcp: writtenHcp || null,
      systemHcp,
      systemIndex: player.frozenIndex,
      written: text(input.written),
      holes,
      markerPlayerId: text(input.markerPlayerId) || player.partnerPlayerId,
      note: [
        text(input.note),
        correctionNote ? `Tabulator correction: ${correctionNote}.` : "",
        cardHdcpNote,
      ]
        .filter(Boolean)
        .join(" "),
      corrections,
    });
  }

  const nameOnly = nameOnlyInputs
    .map((entry) => ({
      id: text(entry.id),
      name: text(entry.name),
      day: dayNumber(entry.day),
      session: text(entry.session),
    }))
    .filter((entry) => entry.name || entry.id);

  if (cards.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        message:
          unmatched.length === 0
            ? "No checked card could be read."
            : unmatched.map((entry) => entry.message).join(" "),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    submission: {
      at: new Date().toISOString(),
      by: submittedBy,
      label,
      slug,
      cards,
      nameOnly,
      unmatched,
    },
  });
}
