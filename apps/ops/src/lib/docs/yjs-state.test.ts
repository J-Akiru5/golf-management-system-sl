import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { decodeBase64, emptyDocState, encodeBase64, encodeDocState } from "./yjs-state";

describe("base64", () => {
  it("round trips bytes above 0x7f and a long payload", () => {
    const bytes = new Uint8Array(70_000);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 7) % 256;
    const encoded = encodeBase64(bytes);
    expect(encoded.length).toBeGreaterThan(0);
    expect(Array.from(decodeBase64(encoded))).toEqual(Array.from(bytes));
  });

  it("decodes a known value", () => {
    expect(Array.from(decodeBase64("AQID"))).toEqual([1, 2, 3]);
  });
});

describe("document state", () => {
  it("writes an empty document as the two byte Yjs update", () => {
    expect(decodeBase64(emptyDocState())).toHaveLength(2);
  });

  it("encodes a document with content as more than the empty state", () => {
    const doc = new Y.Doc();
    doc.getText("body").insert(0, "Cost notes");
    const state = encodeDocState(doc);
    expect(decodeBase64(state).length).toBeGreaterThan(decodeBase64(emptyDocState()).length);
    doc.destroy();
  });
});
