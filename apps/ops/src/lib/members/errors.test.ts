import { describe, expect, it } from "vitest";
import { codeOf, MEMBER_ERROR_MESSAGES, mapMemberError, memberError } from "./errors";

describe("mapMemberError", () => {
  it("maps 42501 to the owner sentence", () => {
    expect(mapMemberError({ code: "42501", message: "only an owner can add members" })).toBe(
      "Only an owner can do that.",
    );
  });

  it("maps P0002 to the missing-account sentence", () => {
    expect(mapMemberError({ code: "P0002", message: "no account" })).toBe(
      "No account has that email address. Create the account in Supabase first, then add them here.",
    );
  });

  it("maps 23505 to the duplicate sentence", () => {
    expect(mapMemberError({ code: "23505", message: "duplicate key" })).toBe(
      "That person is already a member.",
    );
  });

  it("maps 23514 to the last-owner sentence", () => {
    expect(mapMemberError({ code: "23514", message: "check constraint" })).toBe(
      "The workspace needs at least one active owner.",
    );
  });

  it("falls back to the unknown sentence for anything else", () => {
    expect(mapMemberError(new Error("network down"))).toBe(
      "Something went wrong. Nothing was changed.",
    );
    expect(mapMemberError({ code: "XX000", message: "internal" })).toBe(
      "Something went wrong. Nothing was changed.",
    );
    expect(mapMemberError({ code: 42, message: "a number code" })).toBe(
      "Something went wrong. Nothing was changed.",
    );
    expect(mapMemberError(null)).toBe("Something went wrong. Nothing was changed.");
    expect(mapMemberError("a string")).toBe("Something went wrong. Nothing was changed.");
  });

  it("uses the sentences from the exported table, so the copy lives in one place", () => {
    expect(mapMemberError({ code: "42501" })).toBe(MEMBER_ERROR_MESSAGES.denied);
    expect(mapMemberError({ code: "P0002" })).toBe(MEMBER_ERROR_MESSAGES.noAccount);
    expect(mapMemberError({ code: "23505" })).toBe(MEMBER_ERROR_MESSAGES.duplicate);
    expect(mapMemberError({ code: "23514" })).toBe(MEMBER_ERROR_MESSAGES.lastOwner);
    expect(mapMemberError(undefined)).toBe(MEMBER_ERROR_MESSAGES.unknown);
  });
});

describe("memberError", () => {
  it("carries the database code", () => {
    const error = memberError("23514", "the workspace needs at least one active owner");
    expect(error.message).toBe("the workspace needs at least one active owner");
    expect(codeOf(error)).toBe("23514");
    expect(mapMemberError(error)).toBe("The workspace needs at least one active owner.");
  });
});

describe("codeOf", () => {
  it("reads a string code and ignores anything else", () => {
    expect(codeOf({ code: "42501" })).toBe("42501");
    expect(codeOf({ code: 42501 })).toBeNull();
    expect(codeOf({})).toBeNull();
    expect(codeOf(null)).toBeNull();
  });
});
