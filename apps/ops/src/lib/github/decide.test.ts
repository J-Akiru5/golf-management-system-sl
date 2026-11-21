import { describe, expect, it } from "vitest";
import type { TaskStatus } from "@/lib/db/types";
import { isEcho, NOTHING_TO_PUSH, type OutboundInput, planOutbound } from "./decide";
import type { TaskGithubLink } from "./types";

const LINK: TaskGithubLink = {
  issueNumber: 350,
  url: "https://github.com/J-Akiru5/golf-management-system-sl/issues/350",
  state: "open",
  labels: ["ops"],
  milestone: null,
  assignees: ["karlcalimotan"],
  githubUpdatedAt: "2026-11-21T09:00:00Z",
  syncedAt: "2026-11-21T09:05:00Z",
};

const MEMBERS = [
  { login: "karlcalimotan", memberId: "member-karl" },
  { login: "dev-lou", memberId: "member-lou" },
];

function input(overrides: Partial<OutboundInput> = {}): OutboundInput {
  return {
    link: LINK,
    before: { title: "Two-way sync", status: "todo", assigneeId: "member-karl" },
    after: { title: "Two-way sync", status: "todo", assigneeId: "member-karl" },
    members: MEMBERS,
    ...overrides,
  };
}

function moved(status: TaskStatus): OutboundInput {
  return input({ after: { title: "Two-way sync", status, assigneeId: "member-karl" } });
}

describe("the loop guard", () => {
  it("treats an event no newer than the last sync as an echo", () => {
    expect(isEcho(LINK, "2026-11-21T09:00:00Z")).toBe(true);
    expect(isEcho(LINK, "2026-11-21T08:59:59Z")).toBe(true);
  });

  it("lets a newer event through", () => {
    expect(isEcho(LINK, "2026-11-21T09:00:01Z")).toBe(false);
  });

  it("does not call a task with no recorded sync an echo", () => {
    expect(isEcho({ githubUpdatedAt: null }, "2026-11-21T09:00:00Z")).toBe(false);
  });

  it("leaves an unreadable timestamp to the database", () => {
    expect(isEcho(LINK, "not a date")).toBe(false);
    expect(isEcho({ githubUpdatedAt: "not a date" }, "2026-11-21T09:00:00Z")).toBe(false);
  });
});

describe("the outbound plan", () => {
  it("pushes only the title when the title changed", () => {
    const plan = planOutbound(
      input({ after: { title: "A new title", status: "todo", assigneeId: "member-karl" } }),
    );
    expect(plan).toEqual({
      kind: "update",
      patch: { title: "A new title" },
      detail: "Pushed the title from the workspace.",
    });
  });

  it("closes the issue when the task is done and reopens it otherwise", () => {
    expect(planOutbound(moved("done"))).toMatchObject({
      kind: "update",
      patch: { state: "closed" },
    });
    expect(
      planOutbound(
        input({
          before: { title: "Two-way sync", status: "done", assigneeId: "member-karl" },
          after: { title: "Two-way sync", status: "in_progress", assigneeId: "member-karl" },
        }),
      ),
    ).toMatchObject({ kind: "update", patch: { state: "open" } });
  });

  it("does not touch an issue when the task only moves between open columns", () => {
    expect(planOutbound(moved("in_progress"))).toEqual({
      kind: "none",
      reason: NOTHING_TO_PUSH,
    });
    expect(planOutbound(moved("blocked"))).toEqual({ kind: "none", reason: NOTHING_TO_PUSH });
  });

  it("maps the member back to the GitHub login", () => {
    expect(
      planOutbound(
        input({ after: { title: "Two-way sync", status: "todo", assigneeId: "member-lou" } }),
      ),
    ).toMatchObject({ kind: "update", patch: { assignees: ["dev-lou"] } });
  });

  it("unassigns when the task is unassigned", () => {
    expect(
      planOutbound(input({ after: { title: "Two-way sync", status: "todo", assigneeId: null } })),
    ).toMatchObject({ kind: "update", patch: { assignees: [] } });
  });

  it("does not clear the issue's assignees for a member with no mapped login", () => {
    const plan = planOutbound(
      input({ after: { title: "Two-way sync", status: "todo", assigneeId: "member-unknown" } }),
    );
    expect(plan.kind).toBe("none");
    expect(plan).toMatchObject({ reason: expect.stringContaining("no GitHub login is mapped") });
  });

  it("still pushes the other fields when the assignee cannot be mapped", () => {
    const plan = planOutbound(
      input({
        after: { title: "Renamed", status: "done", assigneeId: "member-unknown" },
      }),
    );
    expect(plan).toMatchObject({
      kind: "update",
      patch: { title: "Renamed", state: "closed" },
      detail: expect.stringContaining("no GitHub login is mapped"),
    });
    if (plan.kind === "update") expect(plan.patch.assignees).toBeUndefined();
  });

  it("names every field it pushed", () => {
    const plan = planOutbound(
      input({ after: { title: "Renamed", status: "done", assigneeId: "member-lou" } }),
    );
    expect(plan).toMatchObject({
      detail: "Pushed the title, status and assignee from the workspace.",
    });
  });

  it("does nothing when the save changed nothing GitHub owns", () => {
    expect(planOutbound(input())).toEqual({ kind: "none", reason: NOTHING_TO_PUSH });
  });
});
