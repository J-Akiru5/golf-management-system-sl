// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { GithubFeed } from "@/lib/timeline/github";
import type { TimelineItem } from "@/lib/timeline/types";
import { dayLabel } from "./calendar-view";
import { TimelineView } from "./timeline-view";

afterEach(cleanup);

const TODAY = "2026-11-21";

const items: TimelineItem[] = [
  {
    id: "tournament:t-1",
    kind: "tournament",
    title: "24th Bamboo Tee",
    detail: "Upcoming",
    start: "2026-12-12",
    end: "2026-12-13",
    prepStart: "2026-11-28",
    milestone: false,
    href: "https://golf.example.test/events/t-1",
    people: [],
    basis: "dates",
  },
  {
    id: "card:c-1",
    kind: "card",
    title: "Cebu invitational",
    detail: "Inquiry · Cebu Country Club",
    start: "2026-11-12",
    end: "2026-11-14",
    prepStart: null,
    milestone: false,
    href: "/board?card=c-1",
    people: ["user-mara"],
    basis: "dates",
  },
  {
    id: "card:c-2",
    kind: "card",
    title: "Negros corporate day",
    detail: "Confirmed · Negros Golf",
    start: "2026-11-16",
    end: "2026-11-18",
    prepStart: null,
    milestone: false,
    href: "/board?card=c-2",
    people: ["user-joel"],
    basis: "created-and-updated",
  },
  {
    id: "task:k-1",
    kind: "task",
    title: "Close the pairings",
    detail: "Due · In progress",
    start: "2026-11-20",
    end: "2026-11-20",
    prepStart: null,
    milestone: true,
    href: "/tasks?task=k-1",
    people: ["user-mara"],
    basis: "due-date",
  },
  {
    id: "milestone:1",
    kind: "milestone",
    title: "v1.0.0",
    detail: "Open milestone",
    start: "2026-12-15",
    end: "2026-12-15",
    prepStart: null,
    milestone: true,
    href: "https://github.example.test/milestone/1",
    people: [],
    basis: "due-on",
  },
  {
    id: "release:v0.63.0",
    kind: "release",
    title: "0.63.0",
    detail: "Release · v0.63.0",
    start: "2026-11-21",
    end: "2026-11-21",
    prepStart: null,
    milestone: true,
    href: "https://github.example.test/releases/v0.63.0",
    people: [],
    basis: "published",
  },
];

const members = [
  { id: "user-mara", name: "Mara Santos" },
  { id: "user-joel", name: "Joel Reyes" },
];

const connected: GithubFeed = { status: "ok", milestones: [], releases: [] };

function renderTimeline(overrides: Partial<Parameters<typeof TimelineView>[0]> = {}) {
  return render(
    <TimelineView
      items={items}
      members={members}
      today={TODAY}
      github={connected}
      tournamentsFailed={false}
      demo={false}
      initialTab="calendar"
      {...overrides}
    />,
  );
}

describe("TimelineView", () => {
  it("opens on the calendar, on this month", () => {
    renderTimeline();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Events, pipeline and the work around them",
    );
    expect(screen.getByRole("tab", { name: /Calendar/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByText("November 2026")).toBeTruthy();
    expect(screen.getByText("6 items shown.")).toBeTruthy();
  });

  it("lists a day's items when the day is opened", async () => {
    const user = userEvent.setup();
    renderTimeline();

    await user.click(screen.getByRole("button", { name: /Thursday, 12 November 2026, 1 item/ }));

    expect(
      screen.getByRole("region", { name: "Items on Thursday, 12 November 2026" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /Cebu invitational/ }).getAttribute("href")).toBe(
      "/board?card=c-1",
    );
  });

  it("switches to the chart and draws a row per item", async () => {
    const user = userEvent.setup();
    renderTimeline();

    await user.click(screen.getByRole("tab", { name: /Gantt/ }));

    expect(screen.getByText("Time axis")).toBeTruthy();
    expect(screen.getByText(/A diamond is a single day/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /24th Bamboo Tee/ }).getAttribute("href")).toBe(
      "https://golf.example.test/events/t-1",
    );
    expect(screen.getByRole("link", { name: /Close the pairings/ }).getAttribute("href")).toBe(
      "/tasks?task=k-1",
    );
  });

  it("changes the chart's axis between weeks and months", async () => {
    const user = userEvent.setup();
    renderTimeline({ initialTab: "gantt" });

    expect(screen.getByRole("button", { name: "Months" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Weeks" }));
    expect(screen.getByRole("button", { name: "Weeks" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("narrows the list by person", async () => {
    const user = userEvent.setup();
    renderTimeline();

    await user.selectOptions(screen.getByLabelText("Person"), "user-joel");
    expect(screen.getByText("1 item shown.")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Person"), "");
    expect(screen.getByText("6 items shown.")).toBeTruthy();
  });

  it("narrows the list by kind, and puts a kind back when it is clicked again", async () => {
    const user = userEvent.setup();
    renderTimeline();

    const tournament = screen.getByRole("button", { name: /^Tournament/ });
    expect(tournament.getAttribute("aria-pressed")).toBe("true");

    await user.click(tournament);
    expect(tournament.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("5 items shown.")).toBeTruthy();

    await user.click(tournament);
    expect(tournament.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("6 items shown.")).toBeTruthy();
  });

  it("clears both filters", async () => {
    const user = userEvent.setup();
    renderTimeline();

    await user.selectOptions(screen.getByLabelText("Person"), "user-mara");
    expect(screen.getByText("2 items shown.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("6 items shown.")).toBeTruthy();
  });

  it("says a quiet line when GitHub is not connected", () => {
    renderTimeline({
      github: { status: "unconfigured", message: "Connect GitHub to show milestones." },
    });
    expect(screen.getByText("Connect GitHub to show milestones.")).toBeTruthy();
  });

  it("says so when the tournament list could not be read", () => {
    renderTimeline({ tournamentsFailed: true });
    expect(screen.getByText(/The tournament list could not be read just now/)).toBeTruthy();
  });

  it("labels demo data", () => {
    renderTimeline({ demo: true });
    expect(screen.getByRole("status").textContent).toContain(
      "Demo data. Nothing on this page is real",
    );
  });

  it("explains what a bar means, including the card date fallback", () => {
    renderTimeline();
    expect(screen.getByText(/stage change dates are not stored/)).toBeTruthy();
    expect(screen.getByText(/preparation window/)).toBeTruthy();
  });

  it("shows a calm empty state when the filters match nothing", async () => {
    const user = userEvent.setup();
    renderTimeline({ items: [] });

    expect(screen.getByText("Nothing on the calendar yet")).toBeTruthy();
    expect(screen.getByText("0 items shown.")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: /Gantt/ }));
    expect(screen.getByText("Nothing to plot yet")).toBeTruthy();
  });
});

describe("dayLabel", () => {
  it("says the day is clear", () => {
    expect(dayLabel("2026-11-21", [])).toBe("Saturday, 21 November 2026, nothing scheduled");
  });

  it("speaks the names, not only the count", () => {
    expect(dayLabel("2026-11-12", [items[1] as TimelineItem])).toBe(
      "Thursday, 12 November 2026, 1 item: Cebu invitational",
    );
  });

  it("stops at three names", () => {
    const label = dayLabel("2026-11-12", items.slice(0, 4));
    expect(label).toContain("4 items");
    expect(label).toContain("and 1 more");
  });
});
