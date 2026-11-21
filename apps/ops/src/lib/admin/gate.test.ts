import { beforeEach, describe, expect, it, vi } from "vitest";
import { getServerSupabase } from "@/lib/supabase/server";
import { AdminError, adminErrorMessage, NOT_CONFIGURED_MESSAGE, requireOwner } from "./gate";
import { OWNER_ONLY_MESSAGE } from "./rules";

vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: vi.fn() }));

const supabaseMock = vi.mocked(getServerSupabase);

beforeEach(() => {
  supabaseMock.mockReset();
});

describe("requireOwner", () => {
  it("returns the caller's session client when ws_has_role says owner", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) };
    supabaseMock.mockResolvedValue(client as never);

    await expect(requireOwner()).resolves.toBe(client);
    expect(client.rpc).toHaveBeenCalledWith("ws_has_role", { p_roles: ["owner"] });
  });

  it("refuses a member, a partner and a signed-out caller", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: false, error: null }) };
    supabaseMock.mockResolvedValue(client as never);

    await expect(requireOwner()).rejects.toBeInstanceOf(AdminError);
    await expect(requireOwner()).rejects.toMatchObject({
      code: "42501",
      message: OWNER_ONLY_MESSAGE,
    });
  });

  it("refuses when the role read itself fails", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "nope" } }),
    };
    supabaseMock.mockResolvedValue(client as never);

    await expect(requireOwner()).rejects.toMatchObject({ code: "42501" });
  });

  it("says the database is not configured rather than crashing", async () => {
    supabaseMock.mockRejectedValue(new Error("Supabase is not configured."));

    await expect(requireOwner()).rejects.toMatchObject({
      code: "config",
      message: NOT_CONFIGURED_MESSAGE,
    });
  });
});

describe("adminErrorMessage", () => {
  it("keeps our own words", () => {
    expect(adminErrorMessage(new AdminError("42501", OWNER_ONLY_MESSAGE))).toBe(OWNER_ONLY_MESSAGE);
  });

  it("maps a raw database 42501 to the owner message", () => {
    expect(adminErrorMessage({ code: "42501", message: "whatever" })).toBe(OWNER_ONLY_MESSAGE);
  });

  it("falls back to a plain sentence", () => {
    expect(adminErrorMessage(null)).toBe("Something went wrong. Try again.");
  });
});
