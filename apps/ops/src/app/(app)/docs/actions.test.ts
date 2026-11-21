import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  getDocsViewer: vi.fn(),
  getRepos: vi.fn(),
  revalidatePath: vi.fn(),
  demoMode: vi.fn(() => false),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/access/server", () => ({ requireAccess: mocks.requireAccess }));
vi.mock("@/lib/docs/viewer", () => ({
  getDocsViewer: mocks.getDocsViewer,
  permissionsViewer: (viewer: { role: string }) => ({ role: viewer.role, status: "active" }),
}));
vi.mock("@/lib/repos", () => ({ getRepos: mocks.getRepos }));
vi.mock("@/lib/flags", () => ({ demoMode: mocks.demoMode }));

const { createDocumentAction, deleteDocumentAction, listSnapshotsAction } = await import(
  "./actions"
);

const repos = {
  docs: {
    createDoc: vi.fn(async () => ({ id: "doc-1" })),
    deleteDoc: vi.fn(async () => undefined),
    listSnapshots: vi.fn(async () => []),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDocsViewer.mockResolvedValue({
    id: "user-1",
    displayName: "Mia",
    role: "owner",
    demo: false,
  });
  mocks.getRepos.mockResolvedValue(repos);
  mocks.requireAccess.mockResolvedValue(undefined);
});

describe("the documents server actions", () => {
  it("asks for edit before a write and refuses when the page is read only", async () => {
    mocks.requireAccess.mockRejectedValue(new Error("You have view-only access to that page."));

    const result = await createDocumentAction("A new document");

    expect(mocks.requireAccess).toHaveBeenCalledWith("documents", "edit");
    expect(result).toEqual({ ok: false, error: "You have view-only access to that page." });
    expect(repos.docs.createDoc).not.toHaveBeenCalled();
  });

  it("writes when the person has edit", async () => {
    const result = await createDocumentAction("A new document");

    expect(repos.docs.createDoc).toHaveBeenCalledWith("A new document");
    expect(result).toEqual({ ok: true, value: { id: "doc-1" } });
  });

  it("asks for view before a read", async () => {
    await listSnapshotsAction("doc-1");
    expect(mocks.requireAccess).toHaveBeenCalledWith("documents", "view");
  });

  it("keeps the owner-or-partner rule on top of edit access", async () => {
    mocks.requireAccess.mockRejectedValue(new Error("You do not have access to that page."));

    const result = await deleteDocumentAction("doc-1");

    expect(result.ok).toBe(false);
    expect(repos.docs.deleteDoc).not.toHaveBeenCalled();
  });

  it("deletes for an owner who has edit", async () => {
    const result = await deleteDocumentAction("doc-1");

    expect(repos.docs.deleteDoc).toHaveBeenCalledWith("doc-1");
    expect(result).toEqual({ ok: true, value: null });
  });
});
