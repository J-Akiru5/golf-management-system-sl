"use client";

import type { SpotlightData } from "@/components/spotlight/PlayerSpotlight";
import { fmtHcp, fmtIndex, fmtTime, photoOf } from "@/lib/format";
import { parseName } from "@/lib/names";
import { useDesk } from "@/lib/store/desk-store";

/** "ADORIO, RONNEL" -> first "RONNEL", surname "ADORIO"; "Maria Clara Santos" -> "Maria Clara", "Santos". */
export function splitName(name: string): { first: string; last: string } {
  const parsed = parseName(name);
  if (!parsed.certain && parsed.given === "") return { first: name.trim(), last: "" };
  return { first: parsed.given, last: parsed.surname };
}

/**
 * Builds the spotlight card from what the desk actually holds for a player. Nothing is filled in:
 * no record means the empty line, no consented photo means the placeholder or nothing.
 */
export function useSpotlightData(
  id: string,
  placeholder: SpotlightData["placeholder"] = "silhouette",
): SpotlightData | null {
  const { tournament, playerById, regById, names, draw } = useDesk();
  const p = playerById.get(id);
  const r = regById.get(id);
  if (!p) return null;
  const { first, last } = splitName(p.name);
  const group = draw?.find((g) => g.playerIds.includes(id)) ?? null;
  const shotgun = tournament?.config.startFormat === "shotgun";
  const stats: SpotlightData["stats"] = [];
  if (r?.playingHandicap !== null && r?.playingHandicap !== undefined) {
    stats.push({ label: "Playing hcp", value: fmtHcp(r.playingHandicap) });
  }
  if (group) {
    stats.push({
      label: shotgun ? "Start hole" : "Start tee",
      value: String(group.startHole),
    });
    stats.push({
      label: "Tee time",
      value: fmtTime(group.time).replace(" AM", "").replace(" PM", ""),
    });
  }
  const date = new Date(`${tournament?.config.date ?? "2026-11-12"}T00:00:00`).toLocaleDateString(
    "en-PH",
    {
      weekday: "long",
      month: "long",
      day: "numeric",
    },
  );
  return {
    firstName: first,
    surname: last,
    kicker: `Player profile · ${names.category(r?.categoryId ?? null)}`,
    eventLabel: r?.flightId ? names.flight(r.flightId) : "Tournament",
    eventName: tournament?.name ?? "",
    index: r?.frozenIndex === null || r?.frozenIndex === undefined ? null : fmtIndex(r.frozenIndex),
    stats,
    record: [],
    pairingTitle: group ? `Today · ${names.flight(group.flightId)}` : "Today",
    pairing: group
      ? group.playerIds
          .filter((x) => x !== id)
          .map((x) => playerById.get(x))
          .filter((x) => !!x)
          .map((x) => {
            const reg = regById.get(x.id);
            return `${x.name} · ${fmtIndex(reg?.frozenIndex ?? null)}`;
          })
      : [],
    tee: group
      ? {
          hole: String(group.startHole),
          label: `${shotgun ? "Hole" : "Tee"} ${group.startHole} · ${shotgun ? "Shotgun " : ""}${fmtTime(group.time)}`,
          date,
        }
      : null,
    photo: photoOf(p),
    placeholder,
  };
}
