import { describe, expect, it } from "vitest";
import { LOW_CONFIDENCE_THRESHOLD, scanReadiness } from "./readiness";
import type { ScanImage, ScanReading, ScanRecord, ScanState } from "./types";

const READ_AT = "2026-11-13T08:00:00.000Z";
const PLAYER_NAME = "GORMLEY, DARIO";

const IMAGE: ScanImage = {
  path: "club/round-1/card-1.jpg",
  sha256: "a".repeat(64),
  mime: "image/jpeg",
  bytes: 900000,
};

function sampleReading(overrides: Partial<ScanReading> = {}): ScanReading {
  return {
    engine: "test-reader",
    engineVersion: "1.0.0",
    name: PLAYER_NAME,
    writtenTotal: 78,
    holes: [
      { hole: 1, strokes: 4, confidence: 0.9 },
      { hole: 2, strokes: 5, confidence: 0.8 },
    ],
    readAt: READ_AT,
    ...overrides,
  };
}

function scan(overrides: Partial<ScanRecord> = {}): ScanRecord {
  return {
    id: "scan-1",
    roundId: "round-1",
    state: "matched" as ScanState,
    image: IMAGE,
    reading: sampleReading(),
    suggestions: [],
    playerId: "player-1",
    markerId: "marker-1",
    confirmedBy: null,
    confirmedAt: null,
    scorecardId: null,
    setAside: null,
    ...overrides,
  };
}

const MATCHED = scan();

function codes(items: ReadonlyArray<{ code: string }>): string[] {
  return items.map((item) => item.code);
}

describe("ready scans", () => {
  it("lets a matched scan with a player, marker and image be confirmed", () => {
    const readiness = scanReadiness(MATCHED, { playerName: PLAYER_NAME });
    expect(readiness.canConfirm).toBe(true);
    expect(readiness.canCreateCard).toBe(false);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.warnings).toEqual([]);
  });

  it("lets a confirmed scan create its card", () => {
    const readiness = scanReadiness(
      scan({ state: "confirmed", confirmedBy: "desk-1", confirmedAt: READ_AT }),
      { playerName: PLAYER_NAME },
    );
    expect(readiness.canConfirm).toBe(false);
    expect(readiness.canCreateCard).toBe(true);
    expect(readiness.warnings).toEqual([]);
  });
});

describe("blockers", () => {
  it("blocks when no player is picked", () => {
    const readiness = scanReadiness(scan({ playerId: null }), { playerName: PLAYER_NAME });
    expect(codes(readiness.blockers)).toContain("no_player");
    expect(readiness.canConfirm).toBe(false);
  });

  it("blocks when no marker is picked", () => {
    const readiness = scanReadiness(scan({ markerId: null }), { playerName: PLAYER_NAME });
    expect(codes(readiness.blockers)).toContain("no_marker");
    expect(readiness.canConfirm).toBe(false);
  });

  it("blocks when the marker is the player", () => {
    const readiness = scanReadiness(scan({ markerId: "player-1" }), {
      playerName: PLAYER_NAME,
    });
    expect(codes(readiness.blockers)).toEqual(["marker_is_player"]);
    expect(readiness.canConfirm).toBe(false);
  });

  it("blocks when the photo is missing", () => {
    const readiness = scanReadiness(scan({ image: null }), { playerName: PLAYER_NAME });
    expect(codes(readiness.blockers)).toEqual(["no_image"]);
  });

  it("blocks a scan that was set aside", () => {
    const readiness = scanReadiness(
      scan({
        state: "set_aside",
        setAside: { reason: "blurred photo", by: "desk-1", at: READ_AT },
      }),
      { playerName: PLAYER_NAME },
    );
    expect(codes(readiness.blockers)).toEqual(["set_aside"]);
    expect(readiness.canConfirm).toBe(false);
    expect(readiness.canCreateCard).toBe(false);
  });

  it("blocks a scan that is already a card", () => {
    const readiness = scanReadiness(
      scan({
        state: "card_created",
        confirmedBy: "desk-1",
        confirmedAt: READ_AT,
        scorecardId: "card-1",
      }),
      { playerName: PLAYER_NAME },
    );
    expect(codes(readiness.blockers)).toEqual(["already_card"]);
    expect(readiness.canCreateCard).toBe(false);
  });
});

describe("warnings", () => {
  it("warns when the player already has a card", () => {
    const readiness = scanReadiness(MATCHED, {
      playerName: PLAYER_NAME,
      playersWithCards: ["player-1"],
    });
    expect(codes(readiness.warnings)).toContain("player_has_card");
    expect(readiness.canConfirm).toBe(true);
  });

  it("does not warn about a card for a different player", () => {
    const readiness = scanReadiness(MATCHED, {
      playerName: PLAYER_NAME,
      playersWithCards: ["player-2"],
    });
    expect(codes(readiness.warnings)).not.toContain("player_has_card");
  });

  it("warns when the written total was not read", () => {
    const readiness = scanReadiness(scan({ reading: sampleReading({ writtenTotal: null }) }), {
      playerName: PLAYER_NAME,
    });
    expect(codes(readiness.warnings)).toContain("written_total_missing");
  });

  it("warns when some holes were read at low confidence", () => {
    const readiness = scanReadiness(
      scan({
        reading: sampleReading({
          holes: [
            { hole: 1, strokes: 4, confidence: 0.9 },
            { hole: 2, strokes: 5, confidence: 0.4 },
          ],
        }),
      }),
      { playerName: PLAYER_NAME },
    );
    expect(codes(readiness.warnings)).toContain("low_confidence_holes");
  });

  it("uses the confidence threshold it is given", () => {
    const doubtful = scan({
      reading: sampleReading({
        holes: [{ hole: 1, strokes: 4, confidence: LOW_CONFIDENCE_THRESHOLD - 0.01 }],
      }),
    });
    expect(codes(scanReadiness(doubtful, { playerName: PLAYER_NAME }).warnings)).toContain(
      "low_confidence_holes",
    );
    expect(
      codes(
        scanReadiness(doubtful, {
          playerName: PLAYER_NAME,
          lowConfidenceThreshold: 0.4,
        }).warnings,
      ),
    ).not.toContain("low_confidence_holes");
  });

  it("does not call a hole with no reported confidence doubtful", () => {
    const readiness = scanReadiness(
      scan({ reading: sampleReading({ holes: [{ hole: 1, strokes: 4, confidence: null }] }) }),
      { playerName: PLAYER_NAME },
    );
    expect(codes(readiness.warnings)).not.toContain("low_confidence_holes");
  });

  it("warns when the reader name and the player name differ strongly", () => {
    const readiness = scanReadiness(
      scan({ reading: sampleReading({ name: "COMPLETELY OTHER" }) }),
      {
        playerName: PLAYER_NAME,
      },
    );
    expect(codes(readiness.warnings)).toContain("name_differs");
  });

  it("does not warn when the names agree", () => {
    const readiness = scanReadiness(MATCHED, { playerName: PLAYER_NAME });
    expect(codes(readiness.warnings)).not.toContain("name_differs");
  });
});

describe("arguments", () => {
  it("accepts players and the threshold positionally", () => {
    const readiness = scanReadiness(MATCHED, ["player-1"], 0.4, PLAYER_NAME);
    expect(codes(readiness.warnings)).toContain("player_has_card");
    expect(readiness.canConfirm).toBe(true);
  });
});
