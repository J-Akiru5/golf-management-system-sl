import * as Y from "yjs";

/**
 * Base64 in and out. A Yjs update is binary; the database column is text, so the editor converts
 * both ways. Kept apart from the editor so both can be tested without a browser.
 */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** The full state of a Yjs document as the database stores it. */
export function encodeDocState(doc: Y.Doc): string {
  return encodeBase64(Y.encodeStateAsUpdate(doc));
}

/** The state a document has before anything is written into it. Used to claim the seeding slot. */
export function emptyDocState(): string {
  return encodeDocState(new Y.Doc());
}
