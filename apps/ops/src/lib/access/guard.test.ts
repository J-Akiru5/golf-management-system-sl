import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleAccess } from "./pages";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  currentAccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("./server", () => ({ currentAccess: mocks.currentAccess }));

const { decidePageAccess, requirePageAccess } = await import("./guard");

beforeEach(() => {
  mocks.notFound.mockClear();
  mocks.currentAccess.mockReset();
});

describe("decidePageAccess", () => {
  it("allows a page at view and at edit", () => {
    const access = roleAccess("member");
    expect(decidePageAccess(access, "pipeline", "view")).toBe("allow");
    expect(decidePageAccess(access, "documents", "edit")).toBe("allow");
  });

  it("refuses a page at none", () => {
    expect(decidePageAccess(roleAccess("member"), "admin", "view")).toBe("not_found");
  });

  it("refuses edit when the person only has view", () => {
    expect(decidePageAccess(roleAccess("member"), "pipeline", "edit")).toBe("not_found");
  });

  it("fails closed when there is no access map at all", () => {
    expect(decidePageAccess(null, "overview", "view")).toBe("not_found");
  });
});

describe("requirePageAccess", () => {
  it("does nothing when the page is open", async () => {
    mocks.currentAccess.mockResolvedValue(roleAccess("member"));
    await expect(requirePageAccess("documents")).resolves.toBeUndefined();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("gives the not-found page when the page is hidden", async () => {
    mocks.currentAccess.mockResolvedValue(roleAccess("member"));
    await expect(requirePageAccess("admin")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it("refuses a write on a page the person can only view", async () => {
    mocks.currentAccess.mockResolvedValue(roleAccess("member"));
    await expect(requirePageAccess("pipeline", "edit")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("gives the not-found page to a person with no member row", async () => {
    mocks.currentAccess.mockResolvedValue({});
    await expect(requirePageAccess("overview")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
