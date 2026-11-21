// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingImport,
  parsePendingImport,
  pendingImportKey,
  readPendingImport,
  savePendingImport,
} from "./pending-import";

const content = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Imported line" }] }],
};

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("the pending import handover", () => {
  it("keeps the converted content until the editor asks for it", () => {
    expect(savePendingImport("doc-1", { content, versionName: "Imported from notes.md" })).toBe(
      true,
    );

    const entry = readPendingImport("doc-1");
    expect(entry?.versionName).toBe("Imported from notes.md");
    expect(entry?.content.type).toBe("doc");
  });

  it("keeps each document's content apart", () => {
    savePendingImport("doc-1", { content, versionName: "First" });
    savePendingImport("doc-2", {
      content: { type: "doc", content: [{ type: "paragraph" }] },
      versionName: "Second",
    });

    expect(readPendingImport("doc-1")?.versionName).toBe("First");
    expect(readPendingImport("doc-2")?.versionName).toBe("Second");
    expect(readPendingImport("doc-3")).toBeNull();
  });

  it("clears the entry once the content is in the document", () => {
    savePendingImport("doc-1", { content, versionName: "Imported" });
    clearPendingImport("doc-1");
    expect(readPendingImport("doc-1")).toBeNull();
    expect(window.sessionStorage.getItem(pendingImportKey("doc-1"))).toBeNull();
  });

  it("treats a corrupt or unexpected entry as no entry", () => {
    expect(parsePendingImport("{")).toBeNull();
    expect(parsePendingImport('"doc"')).toBeNull();
    expect(parsePendingImport('{"content":{"type":"paragraph"},"versionName":"x"}')).toBeNull();
    expect(parsePendingImport('{"content":{"type":"doc"},"versionName":"x"}')).toBeNull();
    expect(
      parsePendingImport('{"content":{"type":"doc","content":[]},"versionName":"  "}'),
    ).toBeNull();
    expect(
      parsePendingImport(
        `{"content":{"type":"doc","content":[]},"versionName":"${"a".repeat(121)}"}`,
      ),
    ).toBeNull();
  });

  it("ignores an entry written by something else", () => {
    window.sessionStorage.setItem(pendingImportKey("doc-1"), "not json");
    expect(readPendingImport("doc-1")).toBeNull();
  });
});
