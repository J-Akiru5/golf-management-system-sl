import { describe, expect, it } from "vitest";
import { parseConcernChatEvent } from "./events";
import { framePayloads, takeSseFrames } from "./sse";

describe("reading an SSE body", () => {
  it("keeps a frame that has not ended yet", () => {
    const first = takeSseFrames('data: {"type":"delta","text":"Hel');
    expect(first.frames).toEqual([]);
    expect(first.rest).toContain("Hel");
  });

  it("reads frames across several chunks, including a split payload", () => {
    let buffer = "";
    const seen: unknown[] = [];

    for (const chunk of [
      'data: {"type":"meta","language":"en","fallback":false,"reason":null}\n\n',
      'data: {"type":"del',
      'ta","text":"Hello"}\n\n',
      'data: {"type":"done","fallback":false}\n\n',
    ]) {
      buffer += chunk;
      const { frames, rest } = takeSseFrames(buffer);
      buffer = rest;
      for (const frame of frames) seen.push(...framePayloads(frame));
    }

    expect(seen).toHaveLength(3);
    expect(seen[1]).toEqual({ type: "delta", text: "Hello" });
  });

  it("reads CRLF frame separators", () => {
    const { frames } = takeSseFrames('data: {"type":"done","fallback":true}\r\n\r\n');
    expect(frames).toHaveLength(1);
    expect(framePayloads(frames[0] ?? "")).toEqual([{ type: "done", fallback: true }]);
  });

  it("ignores a frame that is not JSON and an empty frame", () => {
    expect(framePayloads("data: not-json")).toEqual([]);
    expect(framePayloads("event: ping")).toEqual([]);
    const { frames } = takeSseFrames("data: {}\n\n\n\ndata: {}\n\n");
    expect(frames).toHaveLength(2);
  });
});

describe("validating one event", () => {
  it("accepts the four event types with their fields", () => {
    expect(parseConcernChatEvent({ type: "delta", text: "Hi" })).toEqual({
      type: "delta",
      text: "Hi",
    });
    expect(
      parseConcernChatEvent({ type: "meta", language: "ceb", fallback: true, reason: "unparsed" }),
    ).toEqual({ type: "meta", language: "ceb", fallback: true, reason: "unparsed" });
    expect(parseConcernChatEvent({ type: "done", fallback: false })).toEqual({
      type: "done",
      fallback: false,
    });
    expect(parseConcernChatEvent({ type: "error", message: "Failed" })).toEqual({
      type: "error",
      message: "Failed",
    });
  });

  it("keeps a draft, its summary rows and its declines", () => {
    const event = parseConcernChatEvent({
      type: "draft",
      draft: { concerns: ["score"], holeNo: 7, declined: ["handicap"] },
      next: "schedule",
      complete: false,
      summary: [{ field: "holeNo", label: "Hole", value: "7" }],
      declined: ["handicap"],
    });
    expect(event).toMatchObject({
      type: "draft",
      next: "schedule",
      complete: false,
      declined: ["handicap"],
    });
  });

  it("ignores a frame with a missing or unknown type", () => {
    expect(parseConcernChatEvent(null)).toBeNull();
    expect(parseConcernChatEvent({ type: "unknown" })).toBeNull();
    expect(parseConcernChatEvent({ type: "delta" })).toBeNull();
    expect(parseConcernChatEvent({ type: "draft", draft: null })).toBeNull();
  });
});
