import { describe, expect, it } from "vitest";
import {
  agendaGroups,
  basisNote,
  buildTimeline,
  cardItems,
  compareItems,
  itemsOnDay,
  kindsPresent,
  milestoneItems,
  playingDays,
  releaseItems,
  taskItems,
  tournamentItems,
} from "./items";
import type { CardSource, TaskSource, TimelineItem } from "./types";

const opts = { publicBase: "https://golf.example.test/", today: "2026-11-21" };

function card(overrides: Partial<CardSource> = {}): CardSource {
  return {
    id: "card-1",
    title: "24th Bamboo Tee",
    club_name: "Iloilo Golf and Country Club",
    stage: "prep",
    start_date: "2026-12-12",
    end_date: "2026-12-13",
    owner_id: "user-mara",
    created_at: "2026-11-01T09:00:00.000Z",
    updated_at: "2026-11-18T09:00:00.000Z",
    ...overrides,
  };
}

function task(overrides: Partial<TaskSource> = {}): TaskSource {
  return {
    id: "task-1",
    title: "Close the pairings",
    due_date: "2026-12-10",
    status: "in_progress",
    assignee_id: "user-mara",
    ...overrides,
  };
}

function item(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: "item-1",
    kind: "card",
    title: "Item",
    detail: null,
    start: "2026-11-10",
    end: "2026-11-12",
    prepStart: null,
    milestone: false,
    href: null,
    people: [],
    basis: null,
    ...overrides,
  };
}

describe("playingDays", () => {
  it("keeps real days, removes duplicates and sorts ascending", () => {
    expect(playingDays(["2026-12-13", "2026-12-12", "2026-12-13", "nope"])).toEqual([
      "2026-12-12",
      "2026-12-13",
    ]);
  });

  it("returns nothing rather than a guess", () => {
    expect(playingDays([])).toEqual([]);
    expect(playingDays(["2026-02-31"])).toEqual([]);
  });
});

describe("tournamentItems", () => {
  it("maps the playing days and a two-week prep window before the first day", () => {
    const [item] = tournamentItems(
      [
        {
          id: "t-1",
          name: "24th Bamboo Tee",
          dates: ["2026-12-12", "2026-12-13"],
          finished: false,
        },
      ],
      opts,
    );

    expect(item).toMatchObject({
      id: "tournament:t-1",
      kind: "tournament",
      title: "24th Bamboo Tee",
      start: "2026-12-12",
      end: "2026-12-13",
      prepStart: "2026-11-28",
      milestone: false,
      href: "https://golf.example.test/events/t-1",
      basis: "dates",
    });
  });

  it("calls an event that has finished past, and one covering today live", () => {
    const [past, live, upcoming] = tournamentItems(
      [
        { id: "t-1", name: "Past", dates: ["2026-11-01"], finished: true },
        { id: "t-2", name: "Live", dates: ["2026-11-20", "2026-11-22"], finished: false },
        { id: "t-3", name: "Later", dates: ["2027-01-09"], finished: false },
      ],
      opts,
    );

    expect(past?.detail).toBe("Past event");
    expect(live?.detail).toBe("Playing now");
    expect(upcoming?.detail).toBe("Upcoming");
  });

  it("drops an event with no readable day", () => {
    expect(
      tournamentItems([{ id: "t-1", name: "Nothing", dates: [], finished: false }], opts),
    ).toEqual([]);
  });

  it("does not double the slash when the public base ends with one", () => {
    const [item] = tournamentItems(
      [{ id: "t-1", name: "Name", dates: ["2026-12-12"], finished: false }],
      { ...opts, publicBase: "https://golf.example.test/" },
    );
    expect(item?.href).toBe("https://golf.example.test/events/t-1");
  });
});

describe("cardItems", () => {
  it("uses the card's own dates when it has them", () => {
    const [item] = cardItems([card()]);
    expect(item).toMatchObject({
      id: "card:card-1",
      start: "2026-12-12",
      end: "2026-12-13",
      basis: "dates",
      href: "/board?card=card-1",
      people: ["user-mara"],
    });
    expect(item?.detail).toBe("Prep · Iloilo Golf and Country Club");
    expect(item?.prepStart).toBeNull();
  });

  it("falls back to created and updated, and says so", () => {
    const [item] = cardItems([
      card({ start_date: null, end_date: null, title: "Undated deal", stage: "inquiry" }),
    ]);

    expect(item).toMatchObject({
      start: "2026-11-01",
      end: "2026-11-18",
      basis: "created-and-updated",
    });
    expect(basisNote(item?.basis ?? null)).toMatch(/Stage change dates are not stored/);
    expect(item?.detail).toBe("Inquiry · Iloilo Golf and Country Club");
  });

  it("keeps the end on or after the start when the stored dates disagree", () => {
    const [item] = cardItems([
      card({
        start_date: "2026-12-20",
        end_date: "2026-12-01",
        updated_at: "2026-11-18T09:00:00.000Z",
      }),
    ]);
    expect(item?.start).toBe("2026-12-20");
    expect(item?.end).toBe("2026-12-20");
  });

  it("leaves a card with no dates and no usable timestamps out", () => {
    expect(
      cardItems([card({ start_date: null, end_date: null, created_at: "", updated_at: "" })]),
    ).toEqual([]);
  });

  it("treats an unassigned card as nobody", () => {
    const [item] = cardItems([card({ owner_id: null })]);
    expect(item?.people).toEqual([]);
  });
});

describe("taskItems", () => {
  it("puts a task on its due date as a milestone", () => {
    const [item] = taskItems([task()]);
    expect(item).toMatchObject({
      id: "task:task-1",
      start: "2026-12-10",
      end: "2026-12-10",
      milestone: true,
      href: "/tasks?task=task-1",
      people: ["user-mara"],
      basis: "due-date",
    });
    expect(item?.detail).toBe("Due · In progress");
  });

  it("drops a task with no due date", () => {
    expect(taskItems([task({ due_date: null })])).toEqual([]);
  });
});

describe("milestoneItems and releaseItems", () => {
  it("maps a GitHub milestone onto its due day", () => {
    const [item] = milestoneItems([
      { number: 1, title: "v1.0.0", dueOn: "2026-12-15", state: "open", url: "https://gh.test/1" },
    ]);
    expect(item).toMatchObject({
      id: "milestone:1",
      kind: "milestone",
      start: "2026-12-15",
      milestone: true,
      href: "https://gh.test/1",
      detail: "Open milestone",
      basis: "due-on",
    });
  });

  it("names a release by its title, and falls back to the tag", () => {
    const [named, tagged] = releaseItems([
      {
        tag: "v0.63.0",
        name: "0.63.0",
        publishedOn: "2026-11-21",
        url: "https://gh.test/r1",
        prerelease: false,
      },
      {
        tag: "v1.0.0-rc.1",
        name: " ",
        publishedOn: "2026-12-01",
        url: "https://gh.test/r2",
        prerelease: true,
      },
    ]);

    expect(named?.title).toBe("0.63.0");
    expect(named?.detail).toBe("Release · v0.63.0");
    expect(tagged?.title).toBe("v1.0.0-rc.1");
    expect(tagged?.detail).toBe("Pre-release · v1.0.0-rc.1");
  });
});

describe("the combined list", () => {
  const items = buildTimeline({
    tournaments: tournamentItems(
      [{ id: "t-1", name: "Bamboo Tee", dates: ["2026-12-12"], finished: false }],
      opts,
    ),
    cards: cardItems([card()]),
    tasks: taskItems([task()]),
    milestones: milestoneItems([
      { number: 1, title: "v1.0.0", dueOn: "2026-12-15", state: "open", url: "https://gh.test/1" },
    ]),
    releases: releaseItems([
      {
        tag: "v0.63.0",
        name: "0.63.0",
        publishedOn: "2026-11-21",
        url: "https://gh.test/r1",
        prerelease: false,
      },
    ]),
  });

  it("sorts by start day and then by kind", () => {
    expect(items.map((entry) => `${entry.start}:${entry.kind}`)).toEqual([
      "2026-11-21:release",
      "2026-12-10:task",
      "2026-12-12:tournament",
      "2026-12-12:card",
      "2026-12-15:milestone",
    ]);
  });

  it("is stable when two rows share every visible field", () => {
    const a = item({ id: "b", title: "Same" });
    const b = item({ id: "a", title: "Same" });
    expect([a, b].sort(compareItems).map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("knows the kinds present, in the fixed order", () => {
    expect(kindsPresent(items)).toEqual(["tournament", "card", "task", "milestone", "release"]);
    expect(kindsPresent([item({ kind: "task" })])).toEqual(["task"]);
  });

  it("lists a tournament's playing days but not its prep window", () => {
    const tournament = items.find((entry) => entry.kind === "tournament");
    expect(tournament).toBeDefined();
    if (tournament === undefined) return;

    expect(itemsOnDay(items, "2026-12-12").map((entry) => entry.kind)).toContain("tournament");
    expect(itemsOnDay(items, "2026-11-30")).toEqual([]);
  });

  it("groups the agenda by start day, showing an early item on the first day of the range", () => {
    const groups = agendaGroups(items, "2026-12-01", "2026-12-31");
    expect(groups.map((group) => group.day)).toEqual(["2026-12-10", "2026-12-12", "2026-12-15"]);
    expect(groups[1]?.items.map((entry) => entry.kind)).toEqual(["tournament", "card"]);
  });

  it("returns no agenda for a reversed or unreadable range", () => {
    expect(agendaGroups(items, "2026-12-31", "2026-12-01")).toEqual([]);
    expect(agendaGroups(items, "nope", "2026-12-31")).toEqual([]);
  });
});
