import { describe, expect, it } from "vitest";
import {
  matchPairingNames,
  normalizeSheetName,
  type PairingCandidate,
  type PairingGroup,
  parsePairingSheet,
} from "./pairing-sheet";

/** A group shaped like the parser returns one, for the matching tests. */
function group(names: string[], index = 0): PairingGroup {
  return {
    session: "AM",
    teeTime: "06:30",
    startFormat: "shotgun",
    hole: index + 1,
    slot: "A",
    names,
    row: index,
  };
}

describe("parsePairingSheet", () => {
  it("reads both sessions and writes 24-hour tee times", () => {
    const rows: unknown[][] = [
      ["24TH BAMBOO TEE"],
      ["GOLF TOURNAMENT"],
      ["2026-11-12"],
      ["TEE-OFF TIME: 6:30AM SHOTGUN"],
      ["HOLE 1", "SALVADOR, MIRA", "TANAKA, JUN"],
      ["HOLE 2", "DIMALANTA, ORSO"],
      ["24TH BAMBOO TEE"],
      ["GOLF TOURNAMENT"],
      ["2026-11-12"],
      ["TEE-OFF TIME: 12:30PM SHOTGUN"],
      ["HOLE 1", "BANTUAN, LIRA"],
    ];

    const { groups, warnings } = parsePairingSheet(rows);

    expect(warnings).toEqual([]);
    expect(groups).toEqual([
      {
        session: "AM",
        teeTime: "06:30",
        startFormat: "shotgun",
        hole: 1,
        slot: "A",
        names: ["SALVADOR, MIRA", "TANAKA, JUN"],
        row: 4,
      },
      {
        session: "AM",
        teeTime: "06:30",
        startFormat: "shotgun",
        hole: 2,
        slot: "A",
        names: ["DIMALANTA, ORSO"],
        row: 5,
      },
      {
        session: "PM",
        teeTime: "12:30",
        startFormat: "shotgun",
        hole: 1,
        slot: "A",
        names: ["BANTUAN, LIRA"],
        row: 10,
      },
    ]);
  });

  it("reads a midnight tee time and reports no format when SHOTGUN is absent", () => {
    const { groups } = parsePairingSheet([
      ["TEE-OFF TIME: 12:15AM"],
      ["HOLE 18", "ZARAGOZA, WENCESLAO"],
    ]);

    expect(groups[0]?.teeTime).toBe("00:15");
    expect(groups[0]?.startFormat).toBeNull();
    expect(groups[0]?.hole).toBe(18);
  });

  it("keeps B slots and skips slots with no names", () => {
    const rows: unknown[][] = [
      ["TEE-OFF TIME: 6:30AM SHOTGUN"],
      ["HOLE 5B", "CORVINO, HENRI"],
      ["HOLE 5", "BANTUAN, LIRA"],
      ["HOLE 6B"],
      ["HOLE 7", "  ", null, ""],
    ];

    const { groups, warnings } = parsePairingSheet(rows);

    expect(groups.map((entry) => `${entry.hole}${entry.slot}`)).toEqual(["5B", "5A"]);
    expect(groups[0]?.names).toEqual(["CORVINO, HENRI"]);
    expect(warnings).toEqual([]);
  });

  it("warns about names before any session header and still reads later groups", () => {
    const { groups, warnings } = parsePairingSheet([
      ["HOLE 3", "SALVADOR, MIRA"],
      ["TEE-OFF TIME: 6:30AM"],
      ["HOLE 4", "TANAKA, JUN"],
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.hole).toBe(4);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe("no_session");
    expect(warnings[0]?.row).toBe(0);
  });

  it("rejects holes outside 1 to 18 and keeps the valid ones", () => {
    const { groups, warnings } = parsePairingSheet([
      ["TEE-OFF TIME: 6:30AM"],
      ["HOLE 19", "SALVADOR, MIRA"],
      ["HOLE 0", "TANAKA, JUN"],
      ["HOLE 18", "BANTUAN, LIRA"],
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.hole).toBe(18);
    expect(warnings.map((warning) => warning.code)).toEqual(["bad_hole", "bad_hole"]);
    expect(warnings.map((warning) => warning.row)).toEqual([1, 2]);
  });

  it("keeps both groups on a duplicate slot and warns on the later row", () => {
    const { groups, warnings } = parsePairingSheet([
      ["TEE-OFF TIME: 6:30AM"],
      ["HOLE 4", "SALVADOR, MIRA"],
      ["HOLE 4B", "TANAKA, JUN"],
      ["HOLE 4", "BANTUAN, LIRA"],
      ["TEE-OFF TIME: 12:30PM"],
      ["HOLE 4", "CORVINO, HENRI"],
    ]);

    expect(groups).toHaveLength(4);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe("duplicate_slot");
    expect(warnings[0]?.row).toBe(3);
  });

  it("warns about the same normalised name twice in one session", () => {
    const { groups, warnings } = parsePairingSheet([
      ["TEE-OFF TIME: 6:30AM"],
      ["HOLE 1", "ONG-OH, JOEY"],
      ["HOLE 2", "JOEY ONG OH"],
      ["TEE-OFF TIME: 12:30PM"],
      ["HOLE 3", "JOEY ONG OH"],
    ]);

    expect(groups).toHaveLength(3);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe("duplicate_name");
    expect(warnings[0]?.row).toBe(2);
  });

  it("calls a group too large only when a limit is given", () => {
    const rows: unknown[][] = [
      ["TEE-OFF TIME: 6:30AM"],
      ["HOLE 1", "SALVADOR, MIRA", "TANAKA, JUN", "BANTUAN, LIRA"],
    ];

    expect(parsePairingSheet(rows).warnings).toEqual([]);
    expect(parsePairingSheet(rows, { maxGroupSize: 4 }).warnings).toEqual([]);

    const limited = parsePairingSheet(rows, { maxGroupSize: 2 });
    expect(limited.groups).toHaveLength(1);
    expect(limited.groups[0]?.names).toHaveLength(3);
    expect(limited.warnings).toHaveLength(1);
    expect(limited.warnings[0]?.code).toBe("group_too_large");
  });

  it("returns nothing for an empty sheet", () => {
    expect(parsePairingSheet([])).toEqual({ groups: [], warnings: [] });
    expect(parsePairingSheet([[], []])).toEqual({ groups: [], warnings: [] });
  });
});

describe("normalizeSheetName", () => {
  it("sorts the words so comma order and typed order agree", () => {
    expect(normalizeSheetName("Ong-Oh, Joey")).toBe("JOEY OH ONG");
    expect(normalizeSheetName("JOEY ONG OH")).toBe("JOEY OH ONG");
    expect(normalizeSheetName("TANAKA, JUN")).toBe("JUN TANAKA");
  });

  it("strips accents and repairs a broken N-tilde", () => {
    expect(normalizeSheetName("MU\uFFFDOZ, JOSÉ")).toBe("JOSE MUNOZ");
    expect(normalizeSheetName("MUÑOZ, JOSE")).toBe("JOSE MUNOZ");
  });

  it("drops SR, JR, II and III with or without a period", () => {
    expect(normalizeSheetName("DELACRUZ, RAMON JR.")).toBe("DELACRUZ RAMON");
    expect(normalizeSheetName("DELACRUZ, RAMON SR")).toBe("DELACRUZ RAMON");
    expect(normalizeSheetName("DELACRUZ, RAMON III")).toBe("DELACRUZ RAMON");
    expect(normalizeSheetName("DELACRUZ, RAMON II")).toBe("DELACRUZ RAMON");
  });

  it("handles a missing comma, a trailing period and stray punctuation", () => {
    expect(normalizeSheetName("QUERUBIN CHIT")).toBe("CHIT QUERUBIN");
    expect(normalizeSheetName("QUERUBIN, CHIT.")).toBe("CHIT QUERUBIN");
    expect(normalizeSheetName("DARCY, ANNE-MARIE 2")).toBe("ANNE DARCY MARIE");
  });
});

describe("matchPairingNames", () => {
  it("matches exact names, including a missing comma, and reports their positions", () => {
    const roster: PairingCandidate[] = [
      { registrationId: "reg-1", fullName: "Mira Salvador" },
      { registrationId: "reg-2", fullName: "Jun Tanaka" },
    ];

    const result = matchPairingNames(
      [group(["SALVADOR, MIRA", "TANAKA JUN"]), group(["SALVADOR, MIRA"], 1)],
      roster,
    );

    expect(result.matches[0]).toEqual({
      groupIndex: 0,
      nameIndex: 0,
      raw: "SALVADOR, MIRA",
      status: "matched",
      registrationId: "reg-1",
      needsConfirmation: false,
    });
    expect(result.matches[1]).toEqual({
      groupIndex: 0,
      nameIndex: 1,
      raw: "TANAKA JUN",
      status: "matched",
      registrationId: "reg-2",
      needsConfirmation: false,
    });
    expect(result.matches[2]?.status).toBe("not_found");
  });

  it("suggests the one close candidate for a different spelling, but asks first", () => {
    const roster: PairingCandidate[] = [{ registrationId: "reg-3", fullName: "Ronnel Ong" }];

    const result = matchPairingNames([group(["RONEL ONG"])], roster);

    expect(result.matches[0]?.status).toBe("fuzzy");
    expect(result.matches[0]?.registrationId).toBe("reg-3");
    expect(result.matches[0]?.candidateName).toBe("Ronnel Ong");
    expect(result.matches[0]?.needsConfirmation).toBe(true);
    expect(result.summary.fuzzy).toBe(1);
  });

  it("does not try a fuzzy match below six letters", () => {
    const roster: PairingCandidate[] = [{ registrationId: "reg-5", fullName: "Kai Lin" }];

    const result = matchPairingNames([group(["KAI, LI"])], roster);

    expect(result.matches[0]?.status).toBe("not_found");
    expect(result.matches[0]?.registrationId).toBeUndefined();
  });

  it("leaves an exact tie ambiguous", () => {
    const roster: PairingCandidate[] = [
      { registrationId: "reg-1", fullName: "Mira Salvador" },
      { registrationId: "reg-9", fullName: "Mira Salvador" },
    ];

    const result = matchPairingNames([group(["SALVADOR, MIRA"])], roster);

    expect(result.matches[0]?.status).toBe("ambiguous");
    expect(result.matches[0]?.registrationId).toBeUndefined();
    expect(result.matches[0]?.needsConfirmation).toBe(true);
    expect(result.matches[0]?.alternatives).toEqual([
      { registrationId: "reg-1", fullName: "Mira Salvador" },
      { registrationId: "reg-9", fullName: "Mira Salvador" },
    ]);
  });

  it("leaves a fuzzy tie ambiguous", () => {
    const roster: PairingCandidate[] = [
      { registrationId: "reg-4", fullName: "Corvino, Henry" },
      { registrationId: "reg-6", fullName: "Corvino, Henro" },
    ];

    const result = matchPairingNames([group(["CORVINO, HENRI"])], roster);

    expect(result.matches[0]?.status).toBe("ambiguous");
    expect(result.matches[0]?.registrationId).toBeUndefined();
    expect(result.matches[0]?.alternatives).toHaveLength(2);
  });

  it("never guesses a name that is not close", () => {
    const roster: PairingCandidate[] = [{ registrationId: "reg-2", fullName: "Jun Tanaka" }];

    const result = matchPairingNames([group(["ZARAGOZA, WENCESLAO"])], roster);

    expect(result.matches[0]?.status).toBe("not_found");
    expect(result.matches[0]?.registrationId).toBeUndefined();
    expect(result.matches[0]?.candidateName).toBeUndefined();
    expect(result.matches[0]?.needsConfirmation).toBe(false);
  });

  it("uses a candidate once across the whole sheet", () => {
    const roster: PairingCandidate[] = [{ registrationId: "reg-1", fullName: "Mira Salvador" }];

    const result = matchPairingNames(
      [group(["SALVADOR, MIRA"]), group(["MIRA SALVADOR"], 1)],
      roster,
    );

    expect(result.matches[0]?.status).toBe("matched");
    expect(result.matches[1]?.status).toBe("not_found");
    expect(result.summary).toEqual({ matched: 1, fuzzy: 0, ambiguous: 0, not_found: 1 });
    expect(result.unlisted).toEqual([]);
  });

  it("lists candidates that no name matched or was suggested for", () => {
    const roster: PairingCandidate[] = [
      { registrationId: "reg-1", fullName: "Mira Salvador" },
      { registrationId: "reg-2", fullName: "Jun Tanaka" },
      { registrationId: "reg-3", fullName: "Fable Orsolino" },
    ];

    const result = matchPairingNames([group(["TANAKA JUN"])], roster);

    expect(result.unlisted).toEqual([
      { registrationId: "reg-1", fullName: "Mira Salvador" },
      { registrationId: "reg-3", fullName: "Fable Orsolino" },
    ]);
  });

  it("counts every status in one result", () => {
    const roster: PairingCandidate[] = [
      { registrationId: "reg-1", fullName: "Mira Salvador" },
      { registrationId: "reg-3", fullName: "Ronnel Ong" },
      { registrationId: "reg-7", fullName: "Fable Orsolino" },
      { registrationId: "reg-8", fullName: "Fable Orsolino" },
    ];

    const result = matchPairingNames(
      [group(["SALVADOR, MIRA", "RONEL ONG", "ORSOLINO, FABLE", "ZARAGOZA, WENCESLAO"])],
      roster,
    );

    expect(result.matches.map((match) => match.status)).toEqual([
      "matched",
      "fuzzy",
      "ambiguous",
      "not_found",
    ]);
    expect(result.summary).toEqual({ matched: 1, fuzzy: 1, ambiguous: 1, not_found: 1 });
    // The two Fable candidates tied, so neither is matched or suggested.
    expect(result.unlisted.map((candidate) => candidate.registrationId)).toEqual([
      "reg-7",
      "reg-8",
    ]);
  });

  it("returns no matches and every candidate as unlisted for an empty sheet", () => {
    const roster: PairingCandidate[] = [
      { registrationId: "reg-1", fullName: "Mira Salvador" },
      { registrationId: "reg-2", fullName: "Jun Tanaka" },
    ];

    const result = matchPairingNames([], roster);

    expect(result.matches).toEqual([]);
    expect(result.summary).toEqual({ matched: 0, fuzzy: 0, ambiguous: 0, not_found: 0 });
    expect(result.unlisted).toHaveLength(2);
  });

  it("reports every name as not found when the roster is empty", () => {
    const result = matchPairingNames([group(["SALVADOR, MIRA"])], []);

    expect(result.matches[0]?.status).toBe("not_found");
    expect(result.unlisted).toEqual([]);
  });
});
