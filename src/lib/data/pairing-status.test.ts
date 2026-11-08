import { describe, expect, it } from "vitest";
import { countPairings, isPaired, matchesPairing, pairingStatusFromQuery } from "./pairing-status";

describe("isPaired", () => {
  it("reads a partner number as paired", () => {
    expect(isPaired({ teamNo: 1 })).toBe(true);
  });

  it("treats pair zero as a real pair number", () => {
    expect(isPaired({ teamNo: 0 })).toBe(true);
  });

  it("reads a missing, null or undefined number as unpaired", () => {
    expect(isPaired({ teamNo: null })).toBe(false);
    expect(isPaired({ teamNo: undefined })).toBe(false);
    expect(isPaired({})).toBe(false);
    expect(isPaired(null)).toBe(false);
    expect(isPaired(undefined)).toBe(false);
  });
});

describe("pairingStatusFromQuery", () => {
  it("reads the two filters and defaults everything else to all", () => {
    expect(pairingStatusFromQuery("paired")).toBe("paired");
    expect(pairingStatusFromQuery("unpaired")).toBe("unpaired");
    expect(pairingStatusFromQuery("all")).toBe("all");
    expect(pairingStatusFromQuery(null)).toBe("all");
    expect(pairingStatusFromQuery(undefined)).toBe("all");
    expect(pairingStatusFromQuery("")).toBe("all");
    expect(pairingStatusFromQuery("unpaired ")).toBe("all");
    expect(pairingStatusFromQuery("PAIRED")).toBe("all");
  });
});

describe("matchesPairing", () => {
  it("keeps every entry under all", () => {
    expect(matchesPairing({ teamNo: 2 }, "all")).toBe(true);
    expect(matchesPairing(null, "all")).toBe(true);
  });

  it("keeps only partner numbers under paired and only the rest under unpaired", () => {
    expect(matchesPairing({ teamNo: 2 }, "paired")).toBe(true);
    expect(matchesPairing({ teamNo: null }, "paired")).toBe(false);
    expect(matchesPairing(null, "paired")).toBe(false);
    expect(matchesPairing({ teamNo: 2 }, "unpaired")).toBe(false);
    expect(matchesPairing({ teamNo: null }, "unpaired")).toBe(true);
    expect(matchesPairing(undefined, "unpaired")).toBe(true);
  });
});

describe("countPairings", () => {
  it("counts every row once and treats rows without an entry as unpaired", () => {
    const counts = countPairings([
      { teamNo: 1 },
      { teamNo: 1 },
      { teamNo: null },
      {},
      null,
      undefined,
    ]);
    expect(counts).toEqual({ all: 6, paired: 2, unpaired: 4 });
  });

  it("says zero rather than guessing for an empty list", () => {
    expect(countPairings([])).toEqual({ all: 0, paired: 0, unpaired: 0 });
  });

  it("agrees with the counts the pairing views filter to", () => {
    const rows = [{ teamNo: 4 }, null, { teamNo: 7 }];
    const counts = countPairings(rows);

    expect(rows.filter((row) => matchesPairing(row, "paired"))).toHaveLength(counts.paired);
    expect(rows.filter((row) => matchesPairing(row, "unpaired"))).toHaveLength(counts.unpaired);
  });
});
