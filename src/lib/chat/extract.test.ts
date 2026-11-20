import { describe, expect, it } from "vitest";
import { extractJsonObject, parseModelTurn, REPLY_MAX_CHARS } from "./extract";

describe("reading the model's answer", () => {
  it("reads a plain JSON object", () => {
    const turn = parseModelTurn(
      JSON.stringify({
        language: "tl",
        reply: "Saan ang hole?",
        details: { concerns: ["score"], holeNo: 7 },
        declined: ["handicap"],
      }),
    );
    expect(turn).toMatchObject({
      reply: "Saan ang hole?",
      language: "tl",
      patch: { concerns: ["score"], holeNo: 7 },
      declined: ["handicap"],
    });
  });

  it("reads JSON wrapped in a markdown fence", () => {
    const turn = parseModelTurn('```json\n{"reply":"Hello","details":{"playerName":"Juan"}}\n```');
    expect(turn?.reply).toBe("Hello");
    expect(turn?.patch.playerName).toBe("Juan");
  });

  it("accepts fields flattened at the top level, because a smaller model sometimes does", () => {
    const turn = parseModelTurn('Sure. {"reply":"Which hole?","concerns":["score"]}');
    expect(turn?.patch.concerns).toEqual(["score"]);
  });

  it("keeps a prose answer as the reply and extracts nothing from it", () => {
    const turn = parseModelTurn("Kumusta! Unsa ang imong concern?");
    expect(turn).toEqual({
      reply: "Kumusta! Unsa ang imong concern?",
      language: null,
      patch: {},
      declined: [],
    });
  });

  it("drops a language this app does not speak", () => {
    const turn = parseModelTurn('{"reply":"Hi","language":"fr"}');
    expect(turn?.language).toBeNull();
  });

  it("drops a decline for a field that is not optional", () => {
    const turn = parseModelTurn('{"reply":"Hi","declined":["holeNo","handicap"]}');
    expect(turn?.declined).toEqual(["handicap"]);
  });

  it("returns null for an empty or unreadable answer", () => {
    expect(parseModelTurn("")).toBeNull();
    expect(parseModelTurn("   ")).toBeNull();
    expect(parseModelTurn(null)).toBeNull();
    expect(parseModelTurn("{}")).toBeNull();
    expect(parseModelTurn('{"details":{}}')).toBeNull();
  });

  it("strips control characters and caps the reply", () => {
    const turn = parseModelTurn(JSON.stringify({ reply: `a\u0000b` }));
    expect(turn?.reply).toBe("a b");

    const long = parseModelTurn(JSON.stringify({ reply: "x".repeat(REPLY_MAX_CHARS + 100) }));
    expect(long?.reply).toHaveLength(REPLY_MAX_CHARS);
  });

  it("takes the object out of surrounding text", () => {
    const value = extractJsonObject('prefix {"a":1} suffix');
    expect(value).toEqual({ a: 1 });
    expect(extractJsonObject("no braces here")).toBeNull();
    expect(extractJsonObject("{broken")).toBeNull();
  });
});
