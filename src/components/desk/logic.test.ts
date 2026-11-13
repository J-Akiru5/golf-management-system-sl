import { describe, expect, it } from "vitest";
import { FAKE_FIELDS, FAKE_PICKS, pick } from "./fixtures";
import {
  addedByLabel,
  eligibilityView,
  formatAddedAt,
  isRoleAllowed,
  lastSavedLabel,
  MATCH_WEIGHT,
  matchRank,
  missingRequiredFields,
  normaliseText,
  persistenceNote,
  rankPlayerMatches,
  roleLabel,
} from "./logic";
import type { PlayerPickItem } from "./types";

describe("normaliseText", () => {
  it("folds case, accents and extra spaces", () => {
    expect(normaliseText("  PEÑA,  José ")).toBe("pena, jose");
    expect(normaliseText("Dela   Cruz")).toBe("dela cruz");
  });
});

describe("search ranking", () => {
  it("ranks an exact NGAP id above everything else", () => {
    const results = rankPlayerMatches(FAKE_PICKS, "1991");
    expect(results[0]?.player.name).toBe("Pedro Villanueva");
    expect(matchRank(pick("p5"), "1991")).toBe(MATCH_WEIGHT.ngapIdExact);
  });

  it("ranks an id prefix above a name match", () => {
    const results = rankPlayerMatches(FAKE_PICKS, "100");
    expect(results.map((item) => item.player.ngapId)).toEqual(["1001", "1002"]);
  });

  it("finds a surname anywhere in the name", () => {
    const results = rankPlayerMatches(FAKE_PICKS, "cruz");
    expect(results[0]?.player.name).toBe("Juan Dela Cruz");
    expect(matchRank(pick("p6"), "cruz")).toBe(MATCH_WEIGHT.nameWordStart);
  });

  it("ignores case and accents in both directions", () => {
    const accented: PlayerPickItem = {
      ...pick("p1"),
      player: { ...pick("p1").player, name: "José Peña", ngapId: "4200" },
    };
    expect(rankPlayerMatches([accented], "pena")[0]?.player.name).toBe("José Peña");
    expect(matchRank(accented, "JOSE")).toBe(MATCH_WEIGHT.nameStart);
    expect(matchRank(pick("p3"), "MARIA")).toBe(MATCH_WEIGHT.nameStart);
  });

  it("finds a SURNAME, GIVEN name typed in either order, with or without the accent", () => {
    const stored: PlayerPickItem = {
      ...pick("p1"),
      player: { ...pick("p1").player, name: "TAÑADA, JOSE LEONARDO", ngapId: null, nickname: null },
    };
    expect(matchRank(stored, "tanada")).toBe(MATCH_WEIGHT.nameStart);
    expect(matchRank(stored, "jose tanada")).not.toBeNull();
    expect(matchRank(stored, "leonardo tañada")).not.toBeNull();
    expect(matchRank(stored, "tanada maria")).toBeNull();
  });

  it("matches a nickname when the real name does not match", () => {
    expect(matchRank(pick("p6"), "boy")).toBe(MATCH_WEIGHT.nicknameStart);
    expect(rankPlayerMatches(FAKE_PICKS, "boy")[0]?.player.name).toBe("Juan Dela Cruz");
  });

  it("returns nothing for an empty query by keeping the given order, capped", () => {
    const results = rankPlayerMatches(FAKE_PICKS, "   ", { maxResults: 3 });
    expect(results.map((item) => item.player.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("caps the result list", () => {
    expect(rankPlayerMatches(FAKE_PICKS, "a", { maxResults: 2 })).toHaveLength(2);
  });

  it("is stable for players with the same rank", () => {
    const first = rankPlayerMatches(FAKE_PICKS, "an");
    const second = rankPlayerMatches(FAKE_PICKS, "an");
    expect(first.map((item) => item.player.id)).toEqual(second.map((item) => item.player.id));
  });

  it("returns no match for a miss", () => {
    expect(rankPlayerMatches(FAKE_PICKS, "zzz")).toEqual([]);
  });

  it("does not treat a missing id or nickname as a match", () => {
    const noId: PlayerPickItem = {
      ...pick("p4"),
      player: { ...pick("p4").player, ngapId: null, nickname: null },
    };
    expect(matchRank(noId, "1992")).toBeNull();
  });
});

describe("eligibility messaging", () => {
  it("blocks an index above the maximum and names both numbers", () => {
    const view = eligibilityView({ status: "ineligible", index: 31.4, maxIndex: 30 });
    expect(view.blocked).toBe(true);
    expect(view.tone).toBe("bad");
    expect(view.message).toBe(
      "Index 31.4 is above the maximum of 30, so this entry cannot be saved as ready.",
    );
  });

  it("prefers the reason the engine gave", () => {
    const view = eligibilityView({
      status: "ineligible",
      index: 31.4,
      maxIndex: 30,
      reasons: ["Index 31.4 is above the maximum of 30."],
    });
    expect(view.message).toBe("Index 31.4 is above the maximum of 30.");
  });

  it("keeps a review case saveable and explains it", () => {
    const view = eligibilityView({
      status: "needs_review",
      index: null,
      maxIndex: 30,
      reasons: ["No NGAP index was on or before the cut-off (2026-11-01)."],
    });
    expect(view.blocked).toBe(false);
    expect(view.tone).toBe("warn");
    expect(view.message).toContain("No NGAP index");
  });

  it("falls back to a plain review message when there is no reason", () => {
    const view = eligibilityView({ status: "needs_review", index: null, maxIndex: 30 });
    expect(view.message).toContain("Not ready to route yet");
  });

  it("states the limit when a ready player is within it", () => {
    expect(eligibilityView({ status: "ok", index: 12.4, maxIndex: 30 }).message).toBe(
      "Index 12.4 is within the event maximum of 30.",
    );
  });

  it("says the maximum is used when a ready player is above it", () => {
    const view = eligibilityView({ status: "ok", index: 31.4, maxIndex: 30 });
    expect(view.blocked).toBe(false);
    expect(view.message).toBe("Index 31.4 is above the maximum of 30; 30 is used for the draw.");
  });

  it("says 0 is used when a ready player has no index on file", () => {
    expect(eligibilityView({ status: "ok", index: null, maxIndex: 30 }).message).toBe(
      "Ready to route: no index is on file, so the event rule uses 0.",
    );
  });

  it("formats a plus handicap as golfers read it", () => {
    expect(eligibilityView({ status: "ok", index: -1.2, maxIndex: 30 }).message).toBe(
      "Index +1.2 is within the event maximum of 30.",
    );
  });

  it("does not invent a limit when none is configured", () => {
    expect(eligibilityView({ status: "ok", index: 12.4, maxIndex: null }).message).toBe(
      "Index 12.4 is on file and ready to route.",
    );
  });
});

describe("missing required fields", () => {
  it("returns only the required fields that apply to the role and have no answer", () => {
    const missing = missingRequiredFields(FAKE_FIELDS, {}, "member");
    expect(missing.map((field) => field.id)).toEqual(["meal"]);
  });

  it("asks guests for the guest fields", () => {
    expect(missingRequiredFields(FAKE_FIELDS, {}, "guest").map((field) => field.id)).toEqual([
      "cart",
    ]);
  });

  it("accepts an answer and skips optional questions", () => {
    expect(missingRequiredFields(FAKE_FIELDS, { meal: "Fish" }, "member")).toEqual([]);
    expect(missingRequiredFields(FAKE_FIELDS, {}, "guest").some((f) => f.id === "caddie")).toBe(
      false,
    );
  });

  it("treats a checkbox answer as yes or no", () => {
    expect(missingRequiredFields(FAKE_FIELDS, { cart: "yes" }, "guest")).toEqual([]);
    expect(missingRequiredFields(FAKE_FIELDS, { cart: "no" }, "guest")).toEqual([]);
    expect(missingRequiredFields(FAKE_FIELDS, { cart: "  " }, "guest")).toHaveLength(1);
  });
});

describe("time labels", () => {
  const now = new Date(2026, 9, 18, 16, 0); // 18 Oct 2026, 4:00 PM local

  it("shows the clock time for the same day", () => {
    const at = new Date(2026, 9, 18, 14, 5).toISOString();
    expect(formatAddedAt(at, now)).toEqual({ kind: "time", time: "2:05 PM" });
  });

  it("adds the date for another day", () => {
    const at = new Date(2026, 10, 12, 7, 30).toISOString();
    expect(formatAddedAt(at, now)).toEqual({ kind: "datetime", date: "12 Nov", time: "7:30 AM" });
  });

  it("renders nothing when there is no timestamp", () => {
    expect(formatAddedAt(null, now)).toEqual({ kind: "none" });
    expect(formatAddedAt("  ", now)).toEqual({ kind: "none" });
  });

  it("flags an unreadable timestamp instead of guessing", () => {
    expect(formatAddedAt("not a date", now)).toEqual({ kind: "invalid" });
  });

  it("builds the added-by line from whatever is known", () => {
    const at = new Date(2026, 9, 18, 14, 5).toISOString();
    expect(addedByLabel({ addedByName: "Ana Reyes", addedAt: at }, now)).toBe(
      "Added by Ana Reyes at 2:05 PM",
    );
    expect(addedByLabel({ addedAt: at }, now)).toBe("Added at 2:05 PM");
    expect(addedByLabel({ addedByName: "Ana Reyes" }, now)).toBe("Added by Ana Reyes");
    expect(addedByLabel({}, now)).toBeNull();
  });

  it("counts up the last-saved label", () => {
    const justNow = new Date(2026, 9, 18, 15, 59, 30).toISOString();
    const minutes = new Date(2026, 9, 18, 15, 56).toISOString();
    const earlier = new Date(2026, 9, 18, 9, 5).toISOString();
    const daysAgo = new Date(2026, 9, 12, 7, 30).toISOString();
    expect(lastSavedLabel(null, now)).toBe("Not saved yet");
    expect(lastSavedLabel(justNow, now)).toBe("Saved just now");
    expect(lastSavedLabel(minutes, now)).toBe("Saved 4 min ago");
    expect(lastSavedLabel(earlier, now)).toBe("Saved at 9:05 AM");
    expect(lastSavedLabel(daysAgo, now)).toBe("Saved 12 Oct, 7:30 AM");
    expect(lastSavedLabel("junk", now)).toBe("Saved");
  });

  it("treats a timestamp in the future as just saved (clock skew)", () => {
    const ahead = new Date(2026, 9, 18, 16, 5).toISOString();
    expect(lastSavedLabel(ahead, now)).toBe("Saved just now");
  });
});

describe("persistence notice", () => {
  it("says what a session-only save means", () => {
    expect(persistenceNote("session")).toContain("refresh clears it");
  });

  it("says what a database save means", () => {
    expect(persistenceNote("database")).toContain("club database");
  });

  it("stays neutral when the target is unknown", () => {
    expect(persistenceNote(null)).toBe("Nothing is saved until you press Save registration.");
  });

  it("lets the screen override the wording", () => {
    expect(persistenceNote("session", "Custom line.")).toBe("Custom line.");
  });
});

describe("role labels", () => {
  it("labels the three roles and nothing else", () => {
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("organizer")).toBe("Organizer");
    expect(roleLabel("desk")).toBe("Desk");
    expect(roleLabel(null)).toBeNull();
    expect(roleLabel(undefined)).toBeNull();
  });

  it("keeps the gate open when auth is not configured, closed without a membership", () => {
    expect(isRoleAllowed(undefined, ["owner"])).toBe(true);
    expect(isRoleAllowed(null, ["owner", "organizer", "desk"])).toBe(false);
  });

  it("allows only the listed roles", () => {
    expect(isRoleAllowed("owner", ["owner", "organizer"])).toBe(true);
    expect(isRoleAllowed("desk", ["owner", "organizer"])).toBe(false);
    expect(isRoleAllowed("desk", [])).toBe(false);
  });
});
