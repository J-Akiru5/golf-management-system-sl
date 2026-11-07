import { describe, expect, it } from "vitest";
import {
  assessOpenRound,
  drawSignature,
  missingSettingsMessage,
  OPEN_ROUND_CODES,
  OPEN_ROUND_MESSAGES,
  type OpenRoundSettings,
  type OpenRoundSnapshot,
  openRoundErrorMessage,
} from "./open-round";

const CONFIRMED_POLICY = { id: "tb-1", name: "Back 9", confirmed: true };
const UNCONFIRMED_POLICY = { id: "tb-2", name: "Back 6", confirmed: false };

const PUBLISHED_GROUPS = [
  { number: 1, playerIds: ["p1", "p2"] },
  { number: 2, playerIds: ["p3", "p4"] },
];

function settings(overrides: Partial<OpenRoundSettings> = {}): OpenRoundSettings {
  return {
    requiredCards: 2,
    finalizationAuthority: "organizer",
    tieBreakPolicyId: CONFIRMED_POLICY.id,
    rulesVersion: "rules-v1",
    ...overrides,
  };
}

function snapshot(overrides: Partial<OpenRoundSnapshot> = {}): OpenRoundSnapshot {
  return {
    draw: {
      revision: 3,
      published: true,
      publishedGroups: PUBLISHED_GROUPS,
      liveGroups: PUBLISHED_GROUPS,
    },
    roundStatus: "draft",
    storedSettings: settings({
      requiredCards: null,
      finalizationAuthority: null,
      tieBreakPolicyId: null,
      rulesVersion: null,
    }),
    tieBreakPolicies: [CONFIRMED_POLICY, UNCONFIRMED_POLICY],
    ...overrides,
  };
}

describe("drawSignature", () => {
  it("uses the number:ids,ids format joined by a pipe", () => {
    expect(drawSignature(PUBLISHED_GROUPS)).toBe("1:p1,p2|2:p3,p4");
  });

  it("orders groups by number regardless of input order", () => {
    const reversed = [...PUBLISHED_GROUPS].reverse();
    expect(drawSignature(reversed)).toBe(drawSignature(PUBLISHED_GROUPS));
  });

  it("ignores empty groups", () => {
    const withEmpty = [
      { number: 1, playerIds: ["p1"] },
      { number: 2, playerIds: [] },
      { number: 3, playerIds: ["p3"] },
    ];
    expect(drawSignature(withEmpty)).toBe("1:p1|3:p3");
  });
});

describe("assessOpenRound", () => {
  it("is ready when the draw is published, current and the settings are complete", () => {
    const readiness = assessOpenRound(snapshot(), settings(), 3);

    expect(readiness.state).toBe("ready");
  });

  it("reports an already open round for scoring and open", () => {
    for (const roundStatus of ["scoring", "open"] as const) {
      const readiness = assessOpenRound(snapshot({ roundStatus }), settings(), 3);
      expect(readiness).toMatchObject({
        state: "already_open",
        message: OPEN_ROUND_MESSAGES.alreadyOpen,
      });
    }
  });

  it("refuses an unpublished draw", () => {
    const state = snapshot();
    state.draw = { ...state.draw, published: false };

    expect(assessOpenRound(state, settings(), 3)).toMatchObject({
      state: "not_published",
      message: OPEN_ROUND_MESSAGES.notPublished,
    });
  });

  it("refuses a publish without player ids", () => {
    const nullGroups = snapshot();
    nullGroups.draw = { ...nullGroups.draw, publishedGroups: null };
    expect(assessOpenRound(nullGroups, settings(), 3).state).toBe("missing_player_ids");

    const emptyGroups = snapshot();
    emptyGroups.draw = { ...emptyGroups.draw, publishedGroups: [] };
    expect(assessOpenRound(emptyGroups, settings(), 3)).toMatchObject({
      state: "missing_player_ids",
      message: OPEN_ROUND_MESSAGES.missingPlayerIds,
    });
  });

  it("refuses a stale expected revision", () => {
    expect(assessOpenRound(snapshot(), settings(), 2)).toMatchObject({
      state: "draw_moved",
      message: OPEN_ROUND_MESSAGES.staleRevision,
    });
  });

  it("refuses a live board that differs from the published one", () => {
    const state = snapshot();
    state.draw = { ...state.draw, liveGroups: [{ number: 1, playerIds: ["p1"] }] };

    expect(assessOpenRound(state, settings(), 3)).toMatchObject({
      state: "draw_moved",
      message: OPEN_ROUND_MESSAGES.drawMoved,
    });
  });

  it("lists only the absent settings in the stable order", () => {
    const readiness = assessOpenRound(
      snapshot(),
      settings({
        requiredCards: null,
        finalizationAuthority: null,
        tieBreakPolicyId: "tb-missing",
        rulesVersion: "",
      }),
      3,
    );

    expect(readiness).toMatchObject({
      state: "missing_settings",
      missing: ["requiredCards", "finalizationAuthority", "tieBreakPolicyId", "rulesVersion"],
    });
    expect(readiness.message).toBe(
      missingSettingsMessage([
        "requiredCards",
        "finalizationAuthority",
        "tieBreakPolicyId",
        "rulesVersion",
      ]),
    );

    const onlyRules = assessOpenRound(snapshot(), settings({ rulesVersion: null }), 3);
    expect(onlyRules).toMatchObject({ state: "missing_settings", missing: ["rulesVersion"] });
    expect(onlyRules.message).toBe(missingSettingsMessage(["rulesVersion"]));
  });

  it("refuses an unconfirmed tie-break policy", () => {
    expect(
      assessOpenRound(snapshot(), settings({ tieBreakPolicyId: UNCONFIRMED_POLICY.id }), 3),
    ).toMatchObject({
      state: "tie_break_unconfirmed",
      message: OPEN_ROUND_MESSAGES.tieBreakUnconfirmed,
    });
  });
});

describe("missingSettingsMessage", () => {
  it("names the settings after the prefix and closes with a full stop", () => {
    expect(missingSettingsMessage(["requiredCards", "rulesVersion"])).toBe(
      "Set these round settings before opening: required cards, rules version.",
    );
  });
});

describe("openRoundErrorMessage", () => {
  it("maps every database code to the same sentence the shared rules use", () => {
    expect(openRoundErrorMessage(`${OPEN_ROUND_CODES.alreadyOpen}: round 1 is open`)).toBe(
      OPEN_ROUND_MESSAGES.alreadyOpen,
    );
    expect(openRoundErrorMessage(`${OPEN_ROUND_CODES.notPublished}: no snapshot`)).toBe(
      OPEN_ROUND_MESSAGES.notPublished,
    );
    expect(openRoundErrorMessage(`${OPEN_ROUND_CODES.missingPlayerIds}: names only`)).toBe(
      OPEN_ROUND_MESSAGES.missingPlayerIds,
    );
    expect(openRoundErrorMessage(`${OPEN_ROUND_CODES.drawMoved}: live differs`)).toBe(
      OPEN_ROUND_MESSAGES.drawMoved,
    );
    expect(openRoundErrorMessage(`${OPEN_ROUND_CODES.staleRevision}: revision 2`)).toBe(
      OPEN_ROUND_MESSAGES.staleRevision,
    );
    expect(openRoundErrorMessage(`${OPEN_ROUND_CODES.tieBreakUnconfirmed}: back 9`)).toBe(
      OPEN_ROUND_MESSAGES.tieBreakUnconfirmed,
    );
    expect(openRoundErrorMessage(`${OPEN_ROUND_CODES.noPlayingDay}: event 4`)).toBe(
      OPEN_ROUND_MESSAGES.noPlayingDay,
    );
  });

  it("keeps the named missing settings after the prefix", () => {
    expect(
      openRoundErrorMessage(`${OPEN_ROUND_CODES.missingSettings}: required cards, rules version`),
    ).toBe("Set these round settings before opening: required cards, rules version.");
  });

  it("leaves an unrecognised message unchanged", () => {
    expect(openRoundErrorMessage("something else happened")).toBe("something else happened");
  });
});
