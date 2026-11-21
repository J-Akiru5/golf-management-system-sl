import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  getRepos: vi.fn(),
}));

vi.mock("@/lib/access/server", () => ({ requireAccess: mocks.requireAccess }));
vi.mock("@/lib/repos", () => ({ getRepos: mocks.getRepos }));

const { createCardAction, saveCardAction, deleteCardAction } = await import("./actions");

const repos = {
  board: {
    createCard: vi.fn(async () => ({ id: "card-1" })),
    updateCard: vi.fn(async () => ({ id: "card-1" })),
    deleteCard: vi.fn(async () => undefined),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRepos.mockResolvedValue(repos);
  mocks.requireAccess.mockResolvedValue(undefined);
});

describe("the pipeline server actions", () => {
  it("asks for pipeline edit before it creates a card", async () => {
    await createCardAction({ stage: "inquiry", title: "A club", clubName: "IGCC" });
    expect(mocks.requireAccess).toHaveBeenCalledWith("pipeline", "edit");
  });

  it("refuses a write when the person only has view", async () => {
    mocks.requireAccess.mockRejectedValue(new Error("You have view-only access to that page."));

    const result = await createCardAction({
      stage: "inquiry",
      title: "A club",
      clubName: "IGCC",
    });

    expect(result).toEqual({ ok: false, message: "You have view-only access to that page." });
    expect(repos.board.createCard).not.toHaveBeenCalled();
  });

  it("refuses a save and a delete on a read-only page", async () => {
    mocks.requireAccess.mockRejectedValue(new Error("You have view-only access to that page."));

    const saved = await saveCardAction({
      id: "card-1",
      values: {
        title: "A club",
        clubName: "IGCC",
        stage: "inquiry",
        ownerId: "",
        startDate: "",
        endDate: "",
        expectedPlayers: "",
        pricingModel: "",
        quotedAmount: "",
        currency: "PHP",
        notes: "",
        tournamentId: "",
      },
    });
    const deleted = await deleteCardAction("card-1");

    expect(saved.ok).toBe(false);
    expect(deleted.ok).toBe(false);
    expect(repos.board.updateCard).not.toHaveBeenCalled();
    expect(repos.board.deleteCard).not.toHaveBeenCalled();
  });
});
