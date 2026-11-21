import { describe, expect, it } from "vitest";
import { createGithubClient } from "./client";
import type { OutboundInput } from "./decide";
import { pushTaskToGithub, safeError } from "./sync";
import type { TaskGithubLink } from "./types";

const TOKEN = "ghp_never_shown";
const ISSUE = {
  number: 350,
  title: "Renamed in the workspace",
  body: null,
  state: "closed",
  html_url: "https://github.com/J-Akiru5/golf-management-system-sl/issues/350",
  updated_at: "2026-11-21T10:00:00Z",
  labels: [{ name: "ops" }],
  milestone: null,
  assignees: [{ login: "karlcalimotan" }],
};

const LINK: TaskGithubLink = {
  issueNumber: 350,
  url: null,
  state: "open",
  labels: [],
  milestone: null,
  assignees: [],
  githubUpdatedAt: "2026-11-21T09:00:00Z",
  syncedAt: "2026-11-21T09:00:00Z",
};

function input(overrides: Partial<OutboundInput> = {}): OutboundInput {
  return {
    link: LINK,
    before: { title: "Two-way sync", status: "todo", assigneeId: "member-karl" },
    after: { title: "Renamed in the workspace", status: "done", assigneeId: "member-karl" },
    members: [{ login: "karlcalimotan", memberId: "member-karl" }],
    ...overrides,
  };
}

function client(respond: () => Response) {
  return createGithubClient({
    token: TOKEN,
    repository: "J-Akiru5/golf-management-system-sl",
    fetchImpl: async () => respond(),
  });
}

describe("pushing one task", () => {
  it("sends the patch and returns what GitHub stored", async () => {
    let body = "";
    const github = createGithubClient({
      token: TOKEN,
      repository: "J-Akiru5/golf-management-system-sl",
      fetchImpl: async (_url, init) => {
        body = String(init?.body ?? "");
        return new Response(JSON.stringify(ISSUE), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    const outcome = await pushTaskToGithub(input(), github);

    expect(outcome.outcome).toBe("applied");
    expect(body).toBe(JSON.stringify({ title: "Renamed in the workspace", state: "closed" }));
    if (outcome.outcome === "applied") {
      expect(outcome.issue.number).toBe(350);
      expect(outcome.detail).toBe("Pushed the title and status from the workspace.");
    }
  });

  it("sends nothing when the save changed nothing GitHub owns", async () => {
    let called = false;
    const outcome = await pushTaskToGithub(input({ after: input().before }), {
      getIssue: async () => {
        throw new Error("not used");
      },
      updateIssue: async () => {
        called = true;
        throw new Error("not used");
      },
      listOpenIssues: async () => {
        throw new Error("not used");
      },
    });
    expect(called).toBe(false);
    expect(outcome).toEqual({
      outcome: "skipped",
      detail: "Nothing GitHub owns has changed",
    });
  });

  it("returns an error outcome instead of throwing when GitHub refuses", async () => {
    const outcome = await pushTaskToGithub(
      input(),
      client(
        () =>
          new Response(JSON.stringify({ message: "Resource not accessible by integration" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    expect(outcome.outcome).toBe("error");
    if (outcome.outcome === "error") {
      expect(outcome.detail).toBe(
        "GitHub refused the request (403): Resource not accessible by integration",
      );
      expect(outcome.detail).not.toContain(TOKEN);
    }
  });

  it("returns an error outcome when the network is down", async () => {
    const outcome = await pushTaskToGithub(
      input(),
      client(() => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(outcome).toEqual({ outcome: "error", detail: "fetch failed" });
  });

  it("shortens a long failure sentence", () => {
    expect(safeError(new Error("x".repeat(400)))).toHaveLength(300);
    expect(safeError("something odd")).toBe("GitHub could not be reached.");
  });
});
