import { describe, expect, it, vi } from "vitest";
import { runConcernTurn } from "./conversation";
import { chatCopy } from "./copy";
import { CHAT_MAX_TURNS } from "./prompt";

const USER = [{ role: "user", content: "My score on hole 7 is wrong." }];

function answer(value: unknown): () => Promise<string> {
  return async () => (typeof value === "string" ? value : JSON.stringify(value));
}

describe("one turn of the concern chat", () => {
  it("introduces Teeo when there is nothing to answer yet", async () => {
    const result = await runConcernTurn({
      messages: [{ role: "assistant", content: "Hello" }],
      locale: "en",
      complete: answer("should not be called"),
    });
    expect(result.reason).toBe("greeting");
    expect(result.reply).toBe(chatCopy("en").greeting);
    expect(result.fallback).toBe(false);
    expect(result.next).toBe("concerns");
  });

  it("uses the fixed fallback when no provider answers", async () => {
    const result = await runConcernTurn({
      messages: USER,
      locale: "hil",
      complete: async () => null,
    });
    expect(result.fallback).toBe(true);
    expect(result.reason).toBe("provider_unavailable");
    expect(result.locale).toBe("hil");
    expect(result.reply).toBe(chatCopy("hil").fallback);
    expect(result.reply).toContain("/feedback");
  });

  it("uses the fixed fallback when the provider throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runConcernTurn({
      messages: USER,
      locale: "en",
      complete: async () => {
        throw new Error("network");
      },
    });
    expect(result.fallback).toBe(true);
    vi.restoreAllMocks();
  });

  it("uses the fixed fallback when the answer cannot be read at all", async () => {
    const result = await runConcernTurn({ messages: USER, locale: "tl", complete: answer("") });
    expect(result.fallback).toBe(true);
    expect(result.reason).toBe("unparsed");
    expect(result.reply).toBe(chatCopy("tl").fallback);
  });

  it("reaches the summary when the player gave everything", async () => {
    const result = await runConcernTurn({
      messages: USER,
      locale: "en",
      complete: answer({
        language: "en",
        reply: "I have what I need. Please check the note.",
        details: {
          concerns: ["score"],
          holeNo: 7,
          playerName: "Juan",
          handicap: "12.4",
          schedule: "Day 2, 7:12 AM",
        },
      }),
    });
    expect(result.complete).toBe(true);
    expect(result.next).toBeNull();
    expect(result.fallback).toBe(false);
    expect(result.draft.holeNo).toBe(7);
  });

  it("decides the next question in code and appends it when the model only made a statement", async () => {
    const result = await runConcernTurn({
      messages: USER,
      locale: "en",
      complete: answer({ reply: "Noted.", details: { concerns: ["score"] } }),
    });
    expect(result.next).toBe("holeNo");
    expect(result.complete).toBe(false);
    expect(result.reply.startsWith("Noted.")).toBe(true);
    expect(result.reply).toContain(chatCopy("en").questions.holeNo);
  });

  it("asks the code's own question when the model returned details but no words", async () => {
    const result = await runConcernTurn({
      messages: USER,
      locale: "ceb",
      complete: answer({ details: { concerns: ["score"] } }),
    });
    expect(result.reply).toBe(chatCopy("ceb").questions.holeNo);
  });

  it("follows the player into another language the app speaks", async () => {
    const result = await runConcernTurn({
      messages: USER,
      locale: "en",
      complete: answer({
        language: "ceb",
        reply: "Asa nga hole?",
        details: { concerns: ["score"] },
      }),
    });
    expect(result.locale).toBe("ceb");
  });

  it("records a declined optional field and stops asking for it", async () => {
    const result = await runConcernTurn({
      messages: USER,
      locale: "en",
      complete: answer({
        reply: "No problem.",
        details: { concerns: ["inquiry"], playerName: "Juan" },
        declined: ["handicap", "schedule"],
      }),
    });
    expect(result.draft.declined).toEqual(["handicap", "schedule"]);
    expect(result.complete).toBe(true);
  });

  it("keeps a decline the panel already holds when the model forgets to repeat it", async () => {
    const result = await runConcernTurn({
      messages: USER,
      locale: "en",
      declined: ["handicap", "schedule", "not-a-field"],
      complete: answer({
        reply: "Noted.",
        details: { concerns: ["inquiry"], playerName: "Juan" },
      }),
    });
    expect(result.draft.declined).toEqual(["handicap", "schedule"]);
    expect(result.complete).toBe(true);
  });

  it("stops at the turn limit and offers the form", async () => {
    const messages = Array.from({ length: CHAT_MAX_TURNS }, (_, index) => ({
      role: index === CHAT_MAX_TURNS - 1 || index % 2 === 1 ? "user" : "assistant",
      content: `message ${index}`,
    }));
    const result = await runConcernTurn({
      messages,
      locale: "en",
      complete: answer({ reply: "should not be called" }),
    });
    expect(result.reason).toBe("turn_limit");
    expect(result.fallback).toBe(true);
    expect(result.reply).toBe(chatCopy("en").turnLimit);
  });

  it("hands the provider the conversation the player wrote", async () => {
    const messages = Array.from({ length: 8 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `turn ${index}`,
    })).concat({ role: "user", content: "last" });
    const seen: number[] = [];
    await runConcernTurn({
      messages,
      locale: "en",
      complete: async (turns) => {
        seen.push(turns.length);
        return JSON.stringify({ reply: "Ok." });
      },
    });
    expect(seen).toEqual([9]);
  });

  it("accepts an unknown locale as English", async () => {
    const result = await runConcernTurn({
      messages: USER,
      locale: "fr",
      complete: answer({ reply: "Which hole?" }),
    });
    expect(result.locale).toBe("en");
  });
});
