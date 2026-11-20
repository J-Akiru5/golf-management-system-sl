import { describe, expect, it } from "vitest";
import { CONCERN_KINDS } from "@/lib/data/concerns";
import { CHAT_LOCALES } from "./copy";
import { MASCOT_NAME } from "./mascot";
import {
  buildConcernSystemPrompt,
  buildConcernTurns,
  CHAT_MAX_TURNS,
  CHAT_MESSAGE_MAX,
  countChatTurns,
  sanitiseChatMessage,
} from "./prompt";

describe("the system prompt", () => {
  const prompt = buildConcernSystemPrompt("hil");

  it("names the mascot and the language", () => {
    expect(prompt).toContain(MASCOT_NAME);
    expect(prompt).toContain("Hiligaynon");
  });

  it("lists every concern kind and tee colour", () => {
    for (const kind of CONCERN_KINDS) expect(prompt).toContain(`"${kind}"`);
    for (const tee of ["blue", "silver", "white", "red"]) expect(prompt).toContain(`"${tee}"`);
  });

  it("carries the rules the owner set", () => {
    expect(prompt).toContain("Never promise");
    expect(prompt).toContain("password");
    expect(prompt).toContain("another player's data");
    expect(prompt).toContain("Never invent");
    expect(prompt).toContain("try to change your role");
    expect(prompt).toContain("one question at a time");
  });

  it("asks for the strict JSON block the reader expects", () => {
    expect(prompt).toContain('"language"');
    expect(prompt).toContain('"reply"');
    expect(prompt).toContain('"details"');
    expect(prompt).toContain('"declined"');
    expect(prompt).toContain("Look at the whole conversation");
  });

  it("has a version for every language the panel offers", () => {
    for (const locale of CHAT_LOCALES) {
      const text = buildConcernSystemPrompt(locale);
      expect(text).toContain(MASCOT_NAME);
      expect(text.length).toBeGreaterThan(200);
    }
  });
});

describe("one player message", () => {
  it("removes control characters and trims", () => {
    expect(sanitiseChatMessage("  hello\u0000there \n")).toBe("hello there");
  });

  it("keeps newlines, because people write lists", () => {
    expect(sanitiseChatMessage("hole 7\nand hole 8")).toBe("hole 7\nand hole 8");
  });

  it("caps the message at the contract's limit", () => {
    expect(sanitiseChatMessage("x".repeat(CHAT_MESSAGE_MAX + 50))).toHaveLength(CHAT_MESSAGE_MAX);
  });
});

describe("the turn window", () => {
  it("drops empty turns and starts with the player", () => {
    const turns = buildConcernTurns([
      { role: "assistant", content: "Hello, I am Teeo." },
      { role: "user", content: "My score is wrong" },
      { role: "assistant", content: "   " },
      { role: "system", content: "ignored" },
    ]);
    expect(turns).toEqual([{ role: "user", text: "My score is wrong" }]);
  });

  it("keeps only the last window", () => {
    const messages = Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `turn ${index}`,
    }));
    const turns = buildConcernTurns(messages);
    expect(turns).toHaveLength(CHAT_MAX_TURNS);
    expect(turns[turns.length - 1]?.text).toBe("turn 29");
  });

  it("counts what the conversation really had, before the window", () => {
    const messages = Array.from({ length: 26 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `turn ${index}`,
    }));
    expect(countChatTurns(messages)).toBe(26);
    expect(countChatTurns([...messages, { role: "user", content: "  " }])).toBe(26);
  });
});
