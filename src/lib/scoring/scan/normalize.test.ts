import { describe, expect, it } from "vitest";
import { normalizeScanResult } from "./normalize";

function validPayload() {
  return {
    engine: "test-reader",
    engineVersion: "1",
    players: [
      {
        rowIndex: 0,
        name: "Player One",
        writtenTotal: 72,
        holes: Array.from({ length: 18 }, (_, index) => ({
          hole: index + 1,
          strokes: index + 1,
          confidence: 0.91,
        })),
      },
    ],
  };
}

describe("normalizeScanResult", () => {
  it("accepts a complete row and sorts holes by number", () => {
    const result = normalizeScanResult(validPayload());
    expect(result?.players).toHaveLength(1);
    expect(result?.players[0]?.holes.map((hole) => hole.hole)).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 1),
    );
    expect(result?.players[0]?.holes[0]).toEqual({
      hole: 1,
      strokes: 1,
      confidence: 0.91,
    });
  });

  it("keeps missing or unreadable scores as null instead of inventing a value", () => {
    const payload = validPayload();
    payload.players[0]!.holes[0] = { hole: 1, strokes: null, confidence: 0.2 } as never;
    payload.players[0]!.holes[1] = { hole: 2, strokes: 99, confidence: 0.2 } as never;
    const result = normalizeScanResult(payload);
    expect(result?.players[0]?.holes[0]?.strokes).toBeNull();
    expect(result?.players[0]?.holes[1]?.strokes).toBeNull();
  });

  it("rejects duplicate holes", () => {
    const payload = validPayload();
    payload.players[0]!.holes[17] = { hole: 17, strokes: 4, confidence: 0.9 } as never;
    expect(normalizeScanResult(payload)).toBeNull();
  });

  it("rejects a missing hole, bad confidence and missing engine", () => {
    const missing = validPayload();
    missing.players[0]!.holes.pop();
    expect(normalizeScanResult(missing)).toBeNull();

    const badConfidence = validPayload();
    badConfidence.players[0]!.holes[0]!.confidence = 1.5;
    expect(normalizeScanResult(badConfidence)?.players[0]?.holes[0]?.confidence).toBeNull();

    const noEngine = validPayload();
    noEngine.engine = "";
    expect(normalizeScanResult(noEngine)).toBeNull();
  });
});
