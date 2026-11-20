// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardCard } from "@/lib/board/repo";
import { BoardView } from "./board-view";

vi.mock("@/app/(app)/board/actions", () => ({
  createCardAction: vi.fn(),
  saveCardAction: vi.fn(),
  moveCardAction: vi.fn(),
  deleteCardAction: vi.fn(),
}));

import {
  createCardAction,
  deleteCardAction,
  moveCardAction,
  saveCardAction,
} from "@/app/(app)/board/actions";

const createMock = vi.mocked(createCardAction);
const saveMock = vi.mocked(saveCardAction);
const moveMock = vi.mocked(moveCardAction);
const deleteMock = vi.mocked(deleteCardAction);

function card(overrides: Partial<BoardCard>): BoardCard {
  return {
    id: "card-1",
    tournament_id: null,
    title: "Card A",
    club_name: "Iloilo Golf and Country Club",
    stage: "inquiry",
    position: 1000,
    start_date: "2026-12-12",
    end_date: null,
    expected_players: 96,
    pricing_model: "per_player",
    quoted_amount: 1250000,
    currency: "PHP",
    owner_id: "demo-mara",
    notes: null,
    created_by: "demo-user",
    created_at: "2026-11-18T09:15:00.000Z",
    updated_at: "2026-11-18T09:15:00.000Z",
    ...overrides,
  };
}

const members = [
  { user_id: "demo-mara", display_name: "Mara Santos" },
  { user_id: "demo-joel", display_name: "Joel Reyes" },
];

function renderBoard(cards: BoardCard[]) {
  return render(
    <BoardView initialCards={cards} members={members} tournaments={[]} canDelete demo />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("BoardView", () => {
  it("shows the seven pipeline columns and the demo cards", () => {
    renderBoard([card({})]);

    for (const label of [
      "Inquiry",
      "Proposal sent",
      "Confirmed",
      "Prep",
      "Live",
      "Wrap-up",
      "Invoiced / Closed",
    ]) {
      expect(screen.getByRole("region", { name: label })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Open Card A" })).toBeTruthy();
    const inquiry = screen.getByRole("region", { name: "Inquiry" });
    expect(within(inquiry).getByText("Mara Santos")).toBeTruthy();
    // Once on the card, once as the column's quoted total.
    expect(screen.getAllByText("₱1,250,000.00")).toHaveLength(2);
  });

  it("filters by owner without changing the cards", async () => {
    const user = userEvent.setup();
    renderBoard([
      card({ id: "mine", title: "Mara card", owner_id: "demo-mara" }),
      card({ id: "free", title: "Unassigned card", owner_id: null }),
    ]);

    expect(screen.getByRole("button", { name: "Open Mara card" })).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Owner"), "unassigned");

    expect(screen.queryByRole("button", { name: "Open Mara card" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open Unassigned card" })).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Owner"), "all");
    expect(screen.getByRole("button", { name: "Open Mara card" })).toBeTruthy();
  });

  it("filters by month, including cards with no date", async () => {
    const user = userEvent.setup();
    renderBoard([
      card({ id: "dec", title: "December card", start_date: "2026-12-01" }),
      card({ id: "none", title: "Undated card", start_date: null }),
    ]);

    await user.selectOptions(screen.getByLabelText("Month"), "none");
    expect(screen.getByRole("button", { name: "Open Undated card" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open December card" })).toBeNull();
  });

  it("quick-creates a card in a column", async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({
      ok: true,
      card: card({ id: "new", title: "New lead", club_name: "Cebu Country Club", position: 2000 }),
    });
    renderBoard([]);

    await user.click(screen.getByRole("button", { name: "Add to Inquiry" }));
    await user.type(screen.getByPlaceholderText("Title"), "New lead");
    await user.type(screen.getByPlaceholderText("Club"), "Cebu Country Club");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith({
      stage: "inquiry",
      title: "New lead",
      clubName: "Cebu Country Club",
    });
    expect(await screen.findByRole("button", { name: "Open New lead" })).toBeTruthy();
  });

  it("shows a plain message when quick create fails", async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({ ok: false, message: "You cannot add that card." });
    renderBoard([]);

    await user.click(screen.getByRole("button", { name: "Add to Prep" }));
    await user.type(screen.getByPlaceholderText("Title"), "Nope");
    await user.type(screen.getByPlaceholderText("Club"), "Club");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("You cannot add that card.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open Nope" })).toBeNull();
  });

  it("opens the detail sheet and saves an edit", async () => {
    const user = userEvent.setup();
    saveMock.mockResolvedValue({
      ok: true,
      card: card({ id: "card-1", title: "Renamed card", updated_at: "2026-11-19T00:00:00.000Z" }),
    });
    renderBoard([card({})]);

    await user.click(screen.getByRole("button", { name: "Open Card A" }));
    expect(screen.getByRole("dialog", { name: "Card details" })).toBeTruthy();

    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Renamed card");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0]?.[0]).toMatchObject({
      id: "card-1",
      values: { title: "Renamed card", clubName: "Iloilo Golf and Country Club", currency: "PHP" },
    });
    expect(await screen.findByRole("button", { name: "Open Renamed card" })).toBeTruthy();
  });

  it("moves a card with the Move menu instead of dragging", async () => {
    const user = userEvent.setup();
    moveMock.mockResolvedValue({
      ok: true,
      cards: [
        card({
          id: "card-1",
          stage: "prep",
          position: 1000,
          updated_at: "2026-11-19T00:00:00.000Z",
        }),
      ],
    });
    renderBoard([card({})]);

    await user.click(screen.getByRole("button", { name: "Move Card A to another stage" }));
    await user.click(screen.getByRole("button", { name: "Prep" }));

    await waitFor(() => expect(moveMock).toHaveBeenCalledTimes(1));
    expect(moveMock.mock.calls[0]?.[0]).toMatchObject({
      id: "card-1",
      stage: "prep",
      others: [],
    });
  });

  it("hides the delete control from a member who cannot delete", async () => {
    const user = userEvent.setup();
    render(
      <BoardView
        initialCards={[card({})]}
        members={members}
        tournaments={[]}
        canDelete={false}
        demo
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open Card A" }));
    expect(screen.queryByRole("button", { name: "Delete card" })).toBeNull();
  });

  it("deletes a card when the viewer may", async () => {
    const user = userEvent.setup();
    deleteMock.mockResolvedValue({ ok: true });
    renderBoard([card({})]);

    await user.click(screen.getByRole("button", { name: "Open Card A" }));
    await user.click(screen.getByRole("button", { name: "Delete card" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("card-1"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Open Card A" })).toBeNull());
  });
});
