import { describe, expect, it } from "vitest";
import { linkedIssueNumber, linkMap, readTaskLink } from "./links";

const LINKED = {
  id: "task-1",
  title: "Two-way GitHub sync",
  github_issue_number: 350,
  github_url: "https://github.com/J-Akiru5/golf-management-system-sl/issues/350",
  github_state: "open",
  github_labels: ["ops", "workspace"],
  github_milestone: "v1.0.0",
  github_assignees: ["Karlcalimotan"],
  github_updated_at: "2026-11-21T09:00:00Z",
  synced_at: "2026-11-21T09:05:00Z",
};

describe("reading a task's GitHub link", () => {
  it("reads the link from the row", () => {
    expect(readTaskLink(LINKED)).toEqual({
      issueNumber: 350,
      url: "https://github.com/J-Akiru5/golf-management-system-sl/issues/350",
      state: "open",
      labels: ["ops", "workspace"],
      milestone: "v1.0.0",
      assignees: ["Karlcalimotan"],
      githubUpdatedAt: "2026-11-21T09:00:00Z",
      syncedAt: "2026-11-21T09:05:00Z",
    });
  });

  it("is null for a task that is not linked", () => {
    expect(readTaskLink({ id: "task-2", title: "No link" })).toBeNull();
    expect(readTaskLink({ id: "task-2", github_issue_number: null })).toBeNull();
    expect(readTaskLink({ id: "task-2", github_issue_number: 0 })).toBeNull();
    expect(readTaskLink({ id: "task-2", github_issue_number: 1.5 })).toBeNull();
  });

  it("defaults a missing or malformed field instead of throwing", () => {
    expect(
      readTaskLink({
        id: "task-3",
        github_issue_number: 7,
        github_labels: "ops",
        github_assignees: [1, "dev-lou", null],
        github_state: "merged",
        github_url: "  ",
      }),
    ).toEqual({
      issueNumber: 7,
      url: null,
      state: null,
      labels: [],
      milestone: null,
      assignees: ["dev-lou"],
      githubUpdatedAt: null,
      syncedAt: null,
    });
  });

  it("builds a map for the list and the board, skipping rows with no id or no link", () => {
    const map = linkMap([LINKED, { id: "task-2" }, { title: "no id", github_issue_number: 9 }]);
    expect([...map.keys()]).toEqual(["task-1"]);
    expect(map.get("task-1")?.issueNumber).toBe(350);
  });

  it("reports the linked issue number, or null", () => {
    expect(linkedIssueNumber(LINKED)).toBe(350);
    expect(linkedIssueNumber({ id: "task-2" })).toBeNull();
  });
});
