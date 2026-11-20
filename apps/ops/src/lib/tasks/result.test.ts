import { describe, expect, it } from "vitest";
import { messageOf, unwrap } from "./result";

describe("unwrap", () => {
  it("returns the value of a successful result", async () => {
    await expect(unwrap({ ok: true, value: 42 })).resolves.toBe(42);
  });

  it("throws the message of a failed result", async () => {
    await expect(unwrap({ ok: false, error: "Only an owner can do that." })).rejects.toThrow(
      "Only an owner can do that.",
    );
  });
});

describe("messageOf", () => {
  it("uses the error's own message", () => {
    expect(messageOf(new Error("Task not found."))).toBe("Task not found.");
  });

  it("falls back to plain words for anything else", () => {
    expect(messageOf("a string")).toBe("Something went wrong. Try again.");
    expect(messageOf(new Error("   "))).toBe("Something went wrong. Try again.");
  });
});
