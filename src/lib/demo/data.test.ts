import { describe, expect, it } from "vitest";
import { selectIndexForCutOff } from "@/lib/data/frozen";
import { makeDemoSeed, makeDemoTournaments } from "@/lib/demo/data";
import { nameKey } from "@/lib/ngap";

// The demo seed must be stable and honest: the same on every load, fictional names, no invented indexes.

const cutOff = makeDemoTournaments()[0]?.cutOffDate ?? "2026-11-01";

describe("makeDemoSeed", () => {
  it("is deterministic", () => {
    const a = makeDemoSeed(cutOff);
    const b = makeDemoSeed(cutOff);
    expect(a.players.map((p) => p.name)).toEqual(b.players.map((p) => p.name));
    expect(a.records.map((r) => `${r.playerId}:${r.index}:${r.effectiveDate}`)).toEqual(
      b.records.map((r) => `${r.playerId}:${r.index}:${r.effectiveDate}`),
    );
  });

  it("keeps fictional names unique except the deliberate twins", () => {
    const { players } = makeDemoSeed(cutOff);
    const counts = new Map<string, number>();
    for (const p of players) counts.set(nameKey(p.name), (counts.get(nameKey(p.name)) ?? 0) + 1);
    const twins = [...counts.entries()].filter(([, n]) => n > 1);
    expect(twins).toHaveLength(1);
    expect(twins[0]?.[0]).toBe(nameKey("Juan Dela Cruz"));
    expect(twins[0]?.[1]).toBe(2);
  });

  it("keeps the three sample names on the NGAP IDs the sample file links", () => {
    const { players } = makeDemoSeed(cutOff);
    const byName = new Map(players.map((p) => [nameKey(p.name), p]));
    expect(byName.get(nameKey("Antonio Alcantara"))?.ngapId).toBe("1001");
    expect(byName.get(nameKey("Benjamin Bautista"))?.ngapId).toBe("1002");
    expect(byName.get(nameKey("Carlos Castillo"))?.ngapId).toBe("1003");
  });

  it("freezes what the cut-off rule selects for every entry", () => {
    const { players, records, entries } = makeDemoSeed(cutOff);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const player = players.find((p) => p.id === entry.playerId);
      expect(player).toBeDefined();
      const selection = selectIndexForCutOff(
        records.filter((r) => r.playerId === entry.playerId),
        cutOff,
      );
      expect(entry.frozen.index).toBe(selection.index);
      expect(entry.frozen.effectiveDate).toBe(selection.record?.effectiveDate ?? null);
    }
  });

  it("carries the deliberate edge cases", () => {
    const { players, records, entries } = makeDemoSeed(cutOff);
    const byName = new Map(players.map((p) => [nameKey(p.name), p]));

    const overLimit = byName.get(nameKey("Pedro Villanueva"));
    expect(overLimit).toBeDefined();
    expect(records.filter((r) => r.playerId === overLimit?.id).map((r) => r.index)).toContain(31.4);

    const noHandicap = byName.get(nameKey("Ramon Aguilar"));
    const nh = records.find((r) => r.playerId === noHandicap?.id);
    expect(nh?.index).toBeNull();

    const afterCutOff = byName.get(nameKey("Noel Yulo"));
    // Only a record after the cut-off: nothing can be frozen, and the entry says so.
    const entry = entries.find((e) => e.playerId === afterCutOff?.id);
    expect(entry?.frozen.index).toBeNull();
    expect(entry?.frozen.effectiveDate).toBeNull();

    const stub = byName.get(nameKey("Aurelio Tamayo"));
    expect(stub?.birthdate).toBeNull();
    expect(stub?.gender).toBeNull();
    // The stub has no entry: it needs identity before it can register.
    expect(entries.some((e) => e.playerId === stub?.id)).toBe(false);
  });

  it("enters the four guests as guests", () => {
    const { entries, players } = makeDemoSeed(cutOff);
    const guests = entries.filter((e) => e.role === "guest");
    expect(guests).toHaveLength(4);
    for (const g of guests) {
      const p = players.find((x) => x.id === g.playerId);
      expect(p?.homeCourse).toContain("sample");
    }
  });
});
