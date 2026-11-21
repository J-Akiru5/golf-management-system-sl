import { beforeEach, describe, expect, it, vi } from "vitest";
import { signWebhookBody } from "@/lib/github/signature";

/**
 * The route itself: what it answers before it reads anything, and what a valid delivery becomes.
 * The workspace repository and Next's cache are replaced, so nothing here touches a database, a
 * network or a build.
 */

const state = vi.hoisted(() => ({ repo: null as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/github/repo", () => ({ serviceGithubRepo: () => state.repo }));

const { POST } = await import("./route");

const SECRET = "a-webhook-secret-for-the-test";

const ISSUE = {
  number: 350,
  title: "Two-way GitHub sync",
  body: "Issues for dev should show in the ops portal.",
  state: "open",
  html_url: "https://github.com/J-Akiru5/golf-management-system-sl/issues/350",
  updated_at: "2026-11-21T09:00:00Z",
  labels: [{ name: "ops" }],
  milestone: null,
  assignees: [{ login: "karlcalimotan" }],
};

function delivery(
  body: unknown,
  options: { event?: string; signature?: string | null } = {},
): Request {
  const text = JSON.stringify(body);
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("x-github-event", options.event ?? "issues");
  if (options.signature !== null) {
    headers.set("x-hub-signature-256", options.signature ?? signWebhookBody(SECRET, text));
  }
  return new Request("http://localhost/api/github/webhook", {
    method: "POST",
    headers,
    body: text,
  });
}

function repo(answer: unknown) {
  return {
    listUserMap: async () => [],
    saveUserMap: async () => undefined,
    removeUserMap: async () => undefined,
    listLog: async () => [],
    applyIssue: vi.fn(async () => answer),
    markSynced: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  process.env.GITHUB_WEBHOOK_SECRET = SECRET;
  delete process.env.GITHUB_TOKEN;
  state.repo = repo({ status: "applied", task: null });
});

describe("the webhook route", () => {
  it("says which variable is missing when the secret is not set", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const response = await POST(delivery({ action: "opened", issue: ISSUE }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: "GITHUB_WEBHOOK_SECRET is not set on this deployment.",
    });
  });

  it("refuses an unsigned or wrongly signed delivery", async () => {
    const unsigned = await POST(delivery({ issue: ISSUE }, { signature: null }));
    expect(unsigned.status).toBe(401);

    const wrong = await POST(
      delivery(
        { issue: ISSUE },
        { signature: signWebhookBody("another secret", JSON.stringify({ issue: ISSUE })) },
      ),
    );
    expect(wrong.status).toBe(401);

    expect(await wrong.json()).toEqual({
      ok: false,
      error: "The signature did not match.",
    });
  });

  it("acknowledges GitHub's ping", async () => {
    const response = await POST(delivery({ zen: "Keep it simple." }, { event: "ping" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ping: true });
  });

  it("ignores an event that is not issues", async () => {
    const response = await POST(delivery({ action: "created" }, { event: "pull_request" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true });
  });

  it("applies an issues delivery and reports the status without any detail", async () => {
    const applied = repo({ status: "applied", task: null });
    state.repo = applied;

    const response = await POST(delivery({ action: "edited", issue: ISSUE }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "applied", pushed: false });
    expect(applied.applyIssue).toHaveBeenCalledTimes(1);
    expect(applied.applyIssue).toHaveBeenCalledWith(
      expect.objectContaining({ number: 350, title: "Two-way GitHub sync" }),
      "inbound",
    );
  });

  it("acknowledges a delivery whose issue cannot be read", async () => {
    const response = await POST(delivery({ action: "deleted", issue: { number: 350 } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true });
  });

  it("says which variable is missing when the service role key is absent", async () => {
    state.repo = null;
    const response = await POST(delivery({ action: "opened", issue: ISSUE }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: "SUPABASE_SERVICE_ROLE_KEY is not set on this deployment.",
    });
  });

  it("answers a database failure in one plain sentence", async () => {
    state.repo = {
      ...repo(null),
      applyIssue: async () => {
        throw new Error("Could not apply the GitHub issue: connection refused to db.internal");
      },
    };

    const response = await POST(delivery({ action: "opened", issue: ISSUE }));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("The issue could not be applied.");
    expect(JSON.stringify(body)).not.toContain("db.internal");
  });

  it("refuses a delivery that is not JSON even with a valid signature", async () => {
    const text = "not json";
    const response = await POST(
      new Request("http://localhost/api/github/webhook", {
        method: "POST",
        headers: new Headers({
          "x-github-event": "issues",
          "x-hub-signature-256": signWebhookBody(SECRET, text),
        }),
        body: text,
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "The delivery is not JSON." });
  });
});
