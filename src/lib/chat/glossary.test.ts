import { describe, expect, it } from "vitest";
import { CHAT_GLOSSARY } from "./glossary";

describe("the chat glossary", () => {
  it("answers every entry in at most two sentences", () => {
    for (const entry of CHAT_GLOSSARY) {
      expect(entry.term.length).toBeGreaterThan(1);
      expect(entry.answer.length).toBeGreaterThan(10);
      const sentences = entry.answer.split(/[.!?]+\s/).filter(Boolean);
      expect(sentences.length, entry.term).toBeLessThanOrEqual(2);
      expect(entry.answer, entry.term).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("covers the terms players actually ask about", () => {
    const terms = CHAT_GLOSSARY.map((entry) => entry.term.toLowerCase()).join(" ");
    for (const term of [
      "ngap",
      "handicap index",
      "course handicap",
      "playing handicap",
      "stableford",
      "tee colours",
      "shotgun",
      "member and guest pair",
      "classes a to d",
      "cut-off date",
      "pick-up",
      "mulligan",
    ]) {
      expect(terms, term).toContain(term);
    }
  });

  it("defines the meaning without ruling on a player's card", () => {
    for (const entry of CHAT_GLOSSARY) {
      expect(entry.answer, entry.term).not.toMatch(/\b(correct|wrong|ruling)\b/i);
    }
  });

  it("names the body that certifies the handicap", () => {
    const ngap = CHAT_GLOSSARY.find((entry) => entry.term === "NGAP");
    expect(ngap?.answer).toContain("National Golf Association of the Philippines");
  });
});
