import { describe, expect, it } from "vitest";
import { ENTRY_HONEYPOT_FIELD, entryPlayerPayload, normaliseEntryHoneypot } from "./entry-form";

const player = { name: "A Player", birthdate: "1960-01-02", gender: "M" as const };

describe("the entry honeypot", () => {
  it("is a field a person never fills", () => {
    expect(ENTRY_HONEYPOT_FIELD).toBe("entry_do_not_fill");
  });

  it("is empty for anything that is not text", () => {
    expect(normaliseEntryHoneypot(undefined)).toBe("");
    expect(normaliseEntryHoneypot(null)).toBe("");
    expect(normaliseEntryHoneypot(42)).toBe("");
    expect(normaliseEntryHoneypot("   ")).toBe("");
  });

  it("keeps a filled value, trimmed and bounded", () => {
    expect(normaliseEntryHoneypot("  offer  ")).toBe("offer");
    expect(normaliseEntryHoneypot("x".repeat(300))).toHaveLength(200);
  });
});

describe("the entry payload", () => {
  it("adds nothing when the field was not filled", () => {
    const payload = entryPlayerPayload(player, "");
    expect(payload).toEqual(player);
    expect("honeypot" in payload).toBe(false);
  });

  it("sends the field when it was filled, so the server can answer it", () => {
    expect(entryPlayerPayload(player, " script ")).toEqual({ ...player, honeypot: "script" });
  });

  it("does not change the player it was given", () => {
    entryPlayerPayload(player, "script");
    expect("honeypot" in player).toBe(false);
  });
});
