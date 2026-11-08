import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BAMBOO_TEE_2026_RULES } from "./tournament-rules";

const { sections } = BAMBOO_TEE_2026_RULES;

describe("public tournament rules", () => {
  it("keeps the sections the brief and the PDF require", () => {
    const ids = sections.map((section) => section.id);
    for (const required of [
      "format",
      "handicap",
      "local-rules",
      "pace",
      "scorecards",
      "ties",
      "weather",
      "prizes",
    ]) {
      expect(ids).toContain(required);
    }
  });

  it("uses unique anchors and gives every section readable content", () => {
    expect(new Set(sections.map((section) => section.id)).size).toBe(sections.length);
    for (const section of sections) {
      expect(section.title.trim(), section.id).not.toBe("");
      expect(section.summary.trim(), section.id).not.toBe("");
      expect(section.source.trim(), section.id).not.toBe("");
      const hasContent =
        Boolean(section.paragraphs?.length) ||
        Boolean(section.bullets?.length) ||
        Boolean(section.groups?.length) ||
        Boolean(section.tables?.length) ||
        Boolean(section.callouts?.length);
      expect(hasContent, `${section.id} has no content`).toBe(true);
    }
  });

  it("keeps every table rectangular so the phone layout cannot break", () => {
    for (const section of sections) {
      for (const table of section.tables ?? []) {
        expect(table.columns.length, `${section.id}: ${table.caption}`).toBeGreaterThan(0);
        for (const row of table.rows) {
          expect(row, `${section.id}: ${table.caption}`).toHaveLength(table.columns.length);
        }
      }
    }
  });

  it("ships the official PDF the download button points at", () => {
    expect(BAMBOO_TEE_2026_RULES.pdf.href).toMatch(/^\/documents\/.+\.pdf$/);
    expect(BAMBOO_TEE_2026_RULES.pdf.fileName).toBe(
      BAMBOO_TEE_2026_RULES.pdf.href.split("/").at(-1),
    );
    const file = join(process.cwd(), "public", BAMBOO_TEE_2026_RULES.pdf.href.replace(/^\//, ""));
    expect(existsSync(file), `${file} is missing`).toBe(true);
  });
});
