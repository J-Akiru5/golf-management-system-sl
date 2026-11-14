import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/scorecards/submit/route";
import { requireScorecardAccess } from "@/lib/scorecards/access";
import { loadField } from "@/lib/scorecards/field";

vi.mock("@/lib/scorecards/access", () => ({ requireScorecardAccess: vi.fn() }));
vi.mock("@/lib/scorecards/field", () => ({ loadField: vi.fn() }));

const access = vi.mocked(requireScorecardAccess);
const field = vi.mocked(loadField);

const player = {
  playerId: "player-1",
  registrationId: "registration-1",
  partnerPlayerId: "player-2",
  partnerRegistrationId: "registration-2",
  name: "ALINSANGAN, NEIL",
  partner: "PALIC, CHRYSLER ANNE",
  team: 7,
  group: 7,
  dayNumber: 1,
  playDate: "2026-11-12",
  teeTime: "06:30",
  session: "AM" as const,
  startHole: 1,
  wave: "A",
  flight: "A",
  cls: "A",
  formulaClass: "A",
  frozenIndex: 13.6,
  playingHandicap: 15,
  tee: "Blue",
  teeCode: "B",
};

const fieldLookup = {
  event: "24th Bamboo Tee",
  tournamentId: "tournament-1",
  dayNumber: 1,
  playDate: "2026-11-12",
  maxIndex: 30,
  allowance: 1,
  days: [{ day: 1, date: "2026-11-12" }],
  players: [player],
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/scorecards/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const card = {
  id: "card-1",
  playerId: "player-1",
  day: 1,
  session: "AM",
  group: 7,
  tee: "B",
  hdcp: "",
  written: "",
  holes: Array(18).fill(""),
};

beforeEach(() => {
  vi.clearAllMocks();
  access.mockResolvedValue({
    ok: true,
    status: 200,
    message: "",
    role: "tabulation",
    email: "tabulator@example.com",
  });
  field.mockResolvedValue(fieldLookup);
});

describe("tabulator submission route", () => {
  it("uses the system handicap when the card box is blank", async () => {
    const response = await POST(
      request({
        event: "24th Bamboo Tee",
        label: "Day 1 AM",
        slug: "day1am-r5",
        submittedBy: "tabulator@example.com",
        cards: [card],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submission.cards[0]).toMatchObject({
      playerId: "player-1",
      hdcp: "15",
      handicapSource: "system",
      systemHcp: 15,
      markerPlayerId: "player-2",
    });
    expect(body.submission.cards[0].corrections).toEqual({});
  });

  it("scores the card with the desk handicap even when the card writes another", async () => {
    const response = await POST(
      request({
        event: "24th Bamboo Tee",
        label: "Day 1 AM",
        slug: "day1am-r5",
        cards: [{ ...card, hdcp: "16.7" }],
      }),
    );
    const body = await response.json();

    expect(body.submission.cards[0]).toMatchObject({
      hdcp: "15",
      handicapSource: "system",
      cardHdcp: "16.7",
      systemHcp: 15,
    });
    expect(body.submission.cards[0].note).toContain("not used");
  });

  it("refuses a card when the desk has no handicap for the player", async () => {
    field.mockResolvedValue({
      ...fieldLookup,
      players: [{ ...player, playingHandicap: null }],
    });
    const response = await POST(
      request({
        event: "24th Bamboo Tee",
        label: "Day 1 AM",
        slug: "day1am-r5",
        cards: [{ ...card, hdcp: "16.7" }],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toContain("no handicap for this player");
  });

  it("keeps a day and group correction and labels it", async () => {
    const response = await POST(
      request({
        event: "24th Bamboo Tee",
        label: "Day 1 AM",
        slug: "day1am-r5",
        cards: [{ ...card, group: 5 }],
      }),
    );
    const body = await response.json();

    expect(body.submission.cards[0].corrections.group).toBe("7 to 5");
    expect(body.submission.cards[0].note).toContain("Tabulator correction");
  });

  it("refuses a player who is not in the day's field", async () => {
    field.mockResolvedValue({ ...fieldLookup, players: [] });
    const response = await POST(
      request({
        event: "24th Bamboo Tee",
        label: "Day 1 AM",
        slug: "day1am-r5",
        cards: [card],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toContain("not in the Day 1 field");
  });

  it("leaves a name-only card in the submission for the admin", async () => {
    const response = await POST(
      request({
        event: "24th Bamboo Tee",
        label: "Day 1 AM",
        slug: "day1am-r5",
        cards: [card],
        nameOnly: [{ id: "manual-1", name: "NOT, LISTED", day: 1, session: "AM" }],
      }),
    );
    const body = await response.json();

    expect(body.submission.nameOnly).toEqual([
      { id: "manual-1", name: "NOT, LISTED", day: 1, session: "AM" },
    ]);
  });

  it("refuses a tabulation account that is not allowed to use the page", async () => {
    access.mockResolvedValue({
      ok: false,
      status: 403,
      message: "This account is not on the tabulation team.",
    });
    const response = await POST(
      request({
        event: "24th Bamboo Tee",
        label: "Day 1 AM",
        slug: "day1am-r5",
        cards: [card],
      }),
    );

    expect(response.status).toBe(403);
  });
});
