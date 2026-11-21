import { describe, expect, it } from "vitest";
import type { GithubClient } from "./client";
import type { AppliedIssue, GithubSyncRepo } from "./repo";
import type { GithubIssue } from "./types";
import { applyInboundIssue, planConflictPush } from "./webhook";

const ISSUE: GithubIssue = {
  number: 350,
  title: "An older GitHub title",
  body: null,
  state: "open",
  labels: ["ops"],
  milestone: null,
  assignees: ["karlcalimotan"],
  url: "https://github.com/J-Akiru5/golf-management-system-sl/issues/350",
  updatedAt: "2026-11-21T09:00:00Z",
};

type Logged = { taskId: string; outcome: string; detail: string; issue: GithubIssue | null };

function fakeRepo(answer: AppliedIssue): { repo: GithubSyncRepo; logs: Logged[] } {
  const logs: Logged[] = [];
  const repo: GithubSyncRepo = {
    listUserMap: async () => [],
    saveUserMap: async () => undefined,
    removeUserMap: async () => undefined,
    listLog: async () => [],
    applyIssue: async () => answer,
    markSynced: async (taskId, issue, _direction, outcome, detail) => {
      logs.push({ taskId, outcome, detail, issue });
    },
  };
  return { repo, logs };
}

function fakeClient(patchCalls: Array<{ number: number; patch: unknown }>): GithubClient {
  return {
    getIssue: async () => ISSUE,
    updateIssue: async (number, patch) => {
      patchCalls.push({ number, patch });
      return {
        ...ISSUE,
        title: "The workspace title",
        state: "closed",
        updatedAt: "2026-11-21T11:00:00Z",
      };
    },
    listOpenIssues: async () => ({
      issues: [],
      hasMore: false,
      rateLimitRemaining: null,
      rateLimitReset: null,
    }),
  };
}

describe("a conflict the webhook has to settle", () => {
  it("pushes only the fields where the workspace disagrees", () => {
    expect(
      planConflictPush({ id: "t", title: "The workspace title", status: "done" }, ISSUE),
    ).toEqual({ title: "The workspace title", state: "closed" });
    expect(
      planConflictPush({ id: "t", title: "An older GitHub title", status: "todo" }, ISSUE),
    ).toBe(null);
  });

  it("applies a delivery that is not a conflict and pushes nothing", async () => {
    const { repo, logs } = fakeRepo({ status: "applied", task: { id: "task-1" } });
    const patches: Array<{ number: number; patch: unknown }> = [];
    const result = await applyInboundIssue(ISSUE, {
      repo,
      token: "ghp_example",
      makeClient: () => fakeClient(patches),
    });

    expect(result).toEqual({ status: "applied", pushed: false });
    expect(patches).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it("pushes the newer workspace edit after a conflict and logs it", async () => {
    const { repo, logs } = fakeRepo({
      status: "conflict",
      task: { id: "task-1", title: "The workspace title", status: "done" },
    });
    const patches: Array<{ number: number; patch: unknown }> = [];
    const result = await applyInboundIssue(ISSUE, {
      repo,
      token: "ghp_example",
      makeClient: () => fakeClient(patches),
    });

    expect(result).toEqual({ status: "conflict", pushed: true });
    expect(patches).toEqual([
      { number: 350, patch: { title: "The workspace title", state: "closed" } },
    ]);
    expect(logs[0]).toMatchObject({ taskId: "task-1", outcome: "applied" });
    expect(logs[0]?.issue?.updatedAt).toBe("2026-11-21T11:00:00Z");
  });

  it("leaves the issue alone when GitHub already agrees", async () => {
    const { repo, logs } = fakeRepo({
      status: "conflict",
      task: { id: "task-1", title: "An older GitHub title", status: "todo" },
    });
    const patches: Array<{ number: number; patch: unknown }> = [];
    const result = await applyInboundIssue(ISSUE, {
      repo,
      token: "ghp_example",
      makeClient: () => fakeClient(patches),
    });

    expect(result).toEqual({ status: "conflict", pushed: false });
    expect(patches).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it("logs a skip when there is no token to push with", async () => {
    const { repo, logs } = fakeRepo({
      status: "conflict",
      task: { id: "task-1", title: "The workspace title", status: "todo" },
    });
    const result = await applyInboundIssue(ISSUE, {
      repo,
      token: null,
      makeClient: () => fakeClient([]),
    });

    expect(result).toEqual({ status: "conflict", pushed: false });
    expect(logs[0]).toMatchObject({ outcome: "skipped" });
    expect(logs[0]?.detail).toContain("GITHUB_TOKEN is not set");
  });

  it("records an error when GitHub refuses the push, without failing the delivery", async () => {
    const { repo, logs } = fakeRepo({
      status: "conflict",
      task: { id: "task-1", title: "The workspace title", status: "todo" },
    });
    const refusing: GithubClient = {
      getIssue: async () => ISSUE,
      updateIssue: async () => {
        throw new Error("GitHub answered 403: Resource not accessible by integration");
      },
      listOpenIssues: async () => ({
        issues: [],
        hasMore: false,
        rateLimitRemaining: null,
        rateLimitReset: null,
      }),
    };

    const result = await applyInboundIssue(ISSUE, {
      repo,
      token: "ghp_example",
      makeClient: () => refusing,
    });

    expect(result).toEqual({ status: "conflict", pushed: false });
    expect(logs[0]).toMatchObject({ outcome: "error" });
  });
});
