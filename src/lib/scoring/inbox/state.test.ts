import { describe, expect, it } from "vitest";
import { applyScanEvent } from "./state";
import type { ScanEvent, ScanEventResult, ScanReading, ScanRecord, ScanState } from "./types";

const READ_AT = "2026-11-13T08:00:00.000Z";
const CONFIRM_AT = "2026-11-13T08:30:00.000Z";

function sampleReading(overrides: Partial<ScanReading> = {}): ScanReading {
  return {
    engine: "test-reader",
    engineVersion: "1.0.0",
    name: "GORMLEY, DARIO",
    writtenTotal: 78,
    holes: [
      { hole: 1, strokes: 4, confidence: 0.9 },
      { hole: 2, strokes: 5, confidence: 0.7 },
    ],
    readAt: READ_AT,
    ...overrides,
  };
}

function baseScan(overrides: Partial<ScanRecord> = {}): ScanRecord {
  return {
    id: "scan-1",
    roundId: "round-1",
    state: "uploaded",
    image: {
      path: "club/round-1/card-1.jpg",
      sha256: "a".repeat(64),
      mime: "image/jpeg",
      bytes: 900000,
    },
    reading: null,
    suggestions: [],
    playerId: null,
    markerId: null,
    confirmedBy: null,
    confirmedAt: null,
    scorecardId: null,
    setAside: null,
    ...overrides,
  };
}

function uploadedScan(): ScanRecord {
  return baseScan();
}

function readScan(): ScanRecord {
  return baseScan({ state: "read", reading: sampleReading() });
}

function matchedScan(overrides: Partial<ScanRecord> = {}): ScanRecord {
  return baseScan({
    state: "matched",
    reading: sampleReading(),
    playerId: "player-1",
    ...overrides,
  });
}

function confirmedScan(overrides: Partial<ScanRecord> = {}): ScanRecord {
  return baseScan({
    state: "confirmed",
    reading: sampleReading(),
    playerId: "player-1",
    markerId: "marker-1",
    confirmedBy: "desk-1",
    confirmedAt: CONFIRM_AT,
    ...overrides,
  });
}

function cardCreatedScan(): ScanRecord {
  return confirmedScan({ state: "card_created", scorecardId: "card-1" });
}

function setAsideScan(reading: ScanReading | null): ScanRecord {
  return baseScan({
    state: "set_aside",
    reading,
    setAside: { reason: "blurred photo", by: "desk-1", at: CONFIRM_AT },
  });
}

function accepted(result: ScanEventResult): ScanRecord {
  if (!result.ok) throw new Error(`expected an accepted event: ${result.code} ${result.message}`);
  return result.scan;
}

function expectRejected(result: ScanEventResult, code: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.code).toBe(code);
  expect(result.message.length).toBeGreaterThan(0);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const RECORD_READING: ScanEvent = { type: "record_reading", reading: sampleReading() };
const MATCH_PLAYER: ScanEvent = { type: "match", playerId: "player-2" };
const MATCH_NULL: ScanEvent = { type: "match", playerId: null };
const CONFIRM: ScanEvent = { type: "confirm", markerId: "marker-1", by: "desk-1", at: CONFIRM_AT };
const SET_ASIDE: ScanEvent = {
  type: "set_aside",
  reason: "blurred photo",
  by: "desk-1",
  at: CONFIRM_AT,
};
const RESTORE: ScanEvent = { type: "restore" };
const ATTACH_CARD: ScanEvent = {
  type: "attach_card",
  scorecardId: "card-1",
  playerId: "player-1",
};

describe("legal transitions", () => {
  it("moves uploaded to read with record_reading", () => {
    const result = accepted(applyScanEvent(uploadedScan(), RECORD_READING));
    expect(result.state).toBe("read");
    expect(result.reading).toEqual(sampleReading());
  });

  it("re-reads a scan that is already read", () => {
    const fresh = sampleReading({ readAt: "2026-11-13T08:10:00.000Z", writtenTotal: 80 });
    const result = accepted(applyScanEvent(readScan(), { type: "record_reading", reading: fresh }));
    expect(result.state).toBe("read");
    expect(result.reading?.writtenTotal).toBe(80);
  });

  it("moves read to matched with a player", () => {
    const result = accepted(applyScanEvent(readScan(), MATCH_PLAYER));
    expect(result.state).toBe("matched");
    expect(result.playerId).toBe("player-2");
  });

  it("moves matched to matched with another player", () => {
    const before = matchedScan({ markerId: "marker-1" });
    const result = accepted(applyScanEvent(before, MATCH_PLAYER));
    expect(result.state).toBe("matched");
    expect(result.playerId).toBe("player-2");
    expect(result.markerId).toBeNull();
  });

  it("moves matched to read when the player is cleared", () => {
    const result = accepted(applyScanEvent(matchedScan(), MATCH_NULL));
    expect(result.state).toBe("read");
    expect(result.playerId).toBeNull();
    expect(result.reading).not.toBeNull();
  });

  it("moves matched to confirmed with a marker", () => {
    const result = accepted(applyScanEvent(matchedScan(), CONFIRM));
    expect(result.state).toBe("confirmed");
    expect(result.markerId).toBe("marker-1");
    expect(result.confirmedBy).toBe("desk-1");
    expect(result.confirmedAt).toBe(CONFIRM_AT);
  });

  it("reopens confirmed to matched when another player is matched", () => {
    const result = accepted(applyScanEvent(confirmedScan(), MATCH_PLAYER));
    expect(result.state).toBe("matched");
    expect(result.playerId).toBe("player-2");
    expect(result.markerId).toBeNull();
    expect(result.confirmedBy).toBeNull();
    expect(result.confirmedAt).toBeNull();
  });

  it("moves confirmed to card_created with a matching card", () => {
    const result = accepted(applyScanEvent(confirmedScan(), ATTACH_CARD));
    expect(result.state).toBe("card_created");
    expect(result.scorecardId).toBe("card-1");
    expect(result.markerId).toBe("marker-1");
  });

  it("sets aside a new scan", () => {
    const result = accepted(applyScanEvent(uploadedScan(), SET_ASIDE));
    expect(result.state).toBe("set_aside");
    expect(result.setAside).toEqual({
      reason: "blurred photo",
      by: "desk-1",
      at: CONFIRM_AT,
    });
  });

  it("sets aside a read scan", () => {
    expect(accepted(applyScanEvent(readScan(), SET_ASIDE)).state).toBe("set_aside");
  });

  it("sets aside a matched scan and keeps the player for the desk", () => {
    const result = accepted(applyScanEvent(matchedScan(), SET_ASIDE));
    expect(result.state).toBe("set_aside");
    expect(result.playerId).toBe("player-1");
  });

  it("sets aside a confirmed scan", () => {
    expect(accepted(applyScanEvent(confirmedScan(), SET_ASIDE)).state).toBe("set_aside");
  });

  it("restores a set aside scan to read when a reading exists", () => {
    const result = accepted(applyScanEvent(setAsideScan(sampleReading()), RESTORE));
    expect(result.state).toBe("read");
    expect(result.reading).not.toBeNull();
    expect(result.setAside).toBeNull();
    expect(result.playerId).toBeNull();
    expect(result.markerId).toBeNull();
  });

  it("restores a set aside scan to uploaded when there is no reading", () => {
    const result = accepted(applyScanEvent(setAsideScan(null), RESTORE));
    expect(result.state).toBe("uploaded");
    expect(result.reading).toBeNull();
    expect(result.setAside).toBeNull();
  });
});

describe("illegal transitions", () => {
  it("refuses an action from every state with a stable code", () => {
    const cases: ReadonlyArray<{ state: ScanState; scan: ScanRecord; event: ScanEvent }> = [
      { state: "uploaded", scan: uploadedScan(), event: CONFIRM },
      { state: "read", scan: readScan(), event: CONFIRM },
      { state: "matched", scan: matchedScan(), event: ATTACH_CARD },
      { state: "confirmed", scan: confirmedScan(), event: RECORD_READING },
      { state: "card_created", scan: cardCreatedScan(), event: MATCH_PLAYER },
      { state: "set_aside", scan: setAsideScan(sampleReading()), event: RECORD_READING },
    ];
    for (const testCase of cases) {
      expectRejected(applyScanEvent(testCase.scan, testCase.event), "not_allowed_from_state");
    }
  });

  it("refuses matching before the card has been read", () => {
    expectRejected(applyScanEvent(uploadedScan(), MATCH_PLAYER), "not_allowed_from_state");
  });

  it("refuses a restore on a scan that was not set aside", () => {
    expectRejected(applyScanEvent(readScan(), RESTORE), "not_allowed_from_state");
  });

  it("refuses confirming from read", () => {
    expectRejected(applyScanEvent(readScan(), CONFIRM), "not_allowed_from_state");
  });

  it("refuses confirming twice without reopening", () => {
    expectRejected(applyScanEvent(confirmedScan(), CONFIRM), "not_allowed_from_state");
  });

  it("refuses a marker who is the player", () => {
    const event: ScanEvent = {
      type: "confirm",
      markerId: "player-1",
      by: "desk-1",
      at: CONFIRM_AT,
    };
    expectRejected(applyScanEvent(matchedScan(), event), "marker_is_player");
  });

  it("refuses a card that belongs to another player", () => {
    const event: ScanEvent = {
      type: "attach_card",
      scorecardId: "card-1",
      playerId: "player-2",
    };
    expectRejected(applyScanEvent(confirmedScan(), event), "card_player_mismatch");
  });

  it("refuses a set aside reason shorter than three characters", () => {
    const short: ScanEvent = {
      type: "set_aside",
      reason: "ab",
      by: "desk-1",
      at: CONFIRM_AT,
    };
    expectRejected(applyScanEvent(matchedScan(), short), "reason_too_short");
  });

  it("measures the set aside reason after trimming", () => {
    const padded: ScanEvent = {
      type: "set_aside",
      reason: "  ab  ",
      by: "desk-1",
      at: CONFIRM_AT,
    };
    expectRejected(applyScanEvent(matchedScan(), padded), "reason_too_short");
  });
});

describe("card_created is final", () => {
  it("accepts no further event and can still be read", () => {
    const scan = deepFreeze(cardCreatedScan());
    const events: ScanEvent[] = [
      RECORD_READING,
      MATCH_PLAYER,
      MATCH_NULL,
      CONFIRM,
      SET_ASIDE,
      RESTORE,
      ATTACH_CARD,
    ];
    for (const event of events) {
      expectRejected(applyScanEvent(scan, event), "not_allowed_from_state");
    }
    expect(scan.state).toBe("card_created");
    expect(scan.scorecardId).toBe("card-1");
  });
});

describe("input immutability", () => {
  const cases: ReadonlyArray<{ scan: ScanRecord; event: ScanEvent }> = [
    { scan: readScan(), event: RECORD_READING },
    { scan: matchedScan(), event: CONFIRM },
    { scan: matchedScan(), event: MATCH_NULL },
    { scan: confirmedScan(), event: ATTACH_CARD },
    { scan: confirmedScan(), event: SET_ASIDE },
    { scan: setAsideScan(sampleReading()), event: RESTORE },
  ];

  it("does not change a deep-frozen input", () => {
    for (const testCase of cases) {
      const frozen = deepFreeze(testCase.scan);
      const before = JSON.stringify(frozen);
      const result = applyScanEvent(frozen, testCase.event);
      expect(JSON.stringify(frozen)).toBe(before);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.scan).not.toBe(frozen);
    }
  });
});
