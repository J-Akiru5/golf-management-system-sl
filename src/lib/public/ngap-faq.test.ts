import { describe, expect, it } from "vitest";
import { NGAP_FAQ, NGAP_FAQ_CURRENT, NGAP_FAQ_SOURCE } from "./ngap-faq";

describe("the NGAP FAQ content", () => {
  it("keeps all 18 questions, in order, each phrased as a question", () => {
    expect(NGAP_FAQ).toHaveLength(18);
    NGAP_FAQ.forEach((item, index) => {
      expect(item.id, `item ${index + 1}`).toBe(`q${index + 1}`);
      expect(item.question.trim().endsWith("?"), item.id).toBe(true);
    });
  });

  it("has no empty or malformed text", () => {
    for (const item of NGAP_FAQ) {
      const texts = [
        item.question,
        ...item.paragraphs,
        ...(item.bullets ?? []),
        ...(item.note ? [item.note] : []),
      ];
      for (const text of texts) {
        expect(text.trim(), item.id).not.toBe("");
        expect(text, item.id).not.toMatch(/\s{2,}/);
        expect(text, item.id).not.toMatch(/===== PAGE/);
      }
      expect(item.paragraphs.length + (item.bullets?.length ?? 0), item.id).toBeGreaterThan(0);
    }
  });

  it("shows the source's two gaps as notes instead of repairing them", () => {
    const q3 = NGAP_FAQ.find((item) => item.id === "q3");
    expect(q3?.paragraphs.join(" ")).toContain("(indicate date)");
    expect(q3?.note).toMatch(/not supplied|not been guessed/i);

    const q17 = NGAP_FAQ.find((item) => item.id === "q17");
    expect(q17?.note).toMatch(/image/i);

    expect(NGAP_FAQ_SOURCE).toMatch(/2024/);
    expect(NGAP_FAQ_CURRENT).toMatch(/2024/);
  });

  it("does not present the content as club policy or as a current fee", () => {
    for (const item of NGAP_FAQ) {
      expect(item.question, item.id).not.toMatch(/club policy/i);
    }
    expect(NGAP_FAQ_SOURCE).toMatch(/NGAP/i);
  });
});
