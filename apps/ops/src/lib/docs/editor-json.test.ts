import { describe, expect, it } from "vitest";
import { isEditorJson, toPlainJson } from "./editor-json";

describe("isEditorJson", () => {
  it("accepts an object with a type name", () => {
    expect(isEditorJson({ type: "doc", content: [] })).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isEditorJson(null)).toBe(false);
    expect(isEditorJson("doc")).toBe(false);
    expect(isEditorJson({ content: [] })).toBe(false);
    expect(isEditorJson({ type: "" })).toBe(false);
  });
});

describe("toPlainJson", () => {
  it("rebuilds an object with no prototype as a plain object", () => {
    const attrs = Object.create(null) as Record<string, unknown>;
    attrs.level = 2;
    const content = { type: "heading", attrs };
    const plain = toPlainJson(content);
    expect(Object.getPrototypeOf(plain.attrs)).toBe(Object.prototype);
    expect(plain).toEqual({ type: "heading", attrs: { level: 2 } });
  });

  it("walks arrays and nested objects, leaving values alone", () => {
    const doc = {
      type: "doc",
      content: [{ type: "text", text: "Words", marks: [{ type: "bold" }] }, { type: "hardBreak" }],
    };
    const plain = toPlainJson(doc);
    expect(plain).toEqual(doc);
    expect(plain).not.toBe(doc);
    expect(Object.getPrototypeOf(plain.content[0])).toBe(Object.prototype);
  });

  it("keeps a value that is already plain", () => {
    expect(toPlainJson("word")).toBe("word");
    expect(toPlainJson(7)).toBe(7);
    expect(toPlainJson(null)).toBeNull();
  });
});
