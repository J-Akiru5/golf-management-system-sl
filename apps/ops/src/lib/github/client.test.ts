import { describe, expect, it } from "vitest";
import { createGithubClient, type FetchLike, GithubError } from "./client";

const TOKEN = "ghp_never_shown";
const REPOSITORY = "J-Akiru5/golf-management-system-sl";

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

type Captured = { url: string; init: RequestInit | undefined };

function fakeFetch(respond: (captured: Captured) => Response): {
  fetchImpl: FetchLike;
  calls: Captured[];
} {
  const calls: Captured[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const captured = { url, init };
    calls.push(captured);
    return respond(captured);
  };
  return { fetchImpl, calls };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function client(fetchImpl: FetchLike) {
  return createGithubClient({ token: TOKEN, repository: REPOSITORY, fetchImpl });
}

describe("the GitHub client", () => {
  it("updates an issue with the token in a header and no token in the body", async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      json({ ...ISSUE, title: "Renamed", state: "closed" }),
    );
    const issue = await client(fetchImpl).updateIssue(350, { title: "Renamed", state: "closed" });

    expect(issue.title).toBe("Renamed");
    expect(issue.state).toBe("closed");

    const call = calls[0];
    expect(call?.url).toBe(`https://api.github.com/repos/${REPOSITORY}/issues/350`);
    expect(call?.init?.method).toBe("PATCH");
    const headers = call?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(call?.init?.body).toBe(JSON.stringify({ title: "Renamed", state: "closed" }));
    expect(String(call?.init?.body)).not.toContain(TOKEN);
  });

  it("turns a refusal into a safe error that carries no credential", async () => {
    const { fetchImpl } = fakeFetch(() => json({ message: "Bad credentials" }, 401));
    const error = await client(fetchImpl)
      .updateIssue(350, { title: "x" })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(GithubError);
    expect((error as GithubError).status).toBe(401);
    expect((error as GithubError).message).toBe("Bad credentials");
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it("uses a plain sentence when GitHub sends no message", async () => {
    const { fetchImpl } = fakeFetch(
      () => new Response("<html>bad gateway</html>", { status: 502 }),
    );
    const error = (await client(fetchImpl)
      .getIssue(350)
      .catch((cause: unknown) => cause)) as GithubError;
    expect(error.status).toBe(502);
    expect(error.message).toBe("GitHub answered 502.");
  });

  it("refuses a response it cannot read as an issue", async () => {
    const { fetchImpl } = fakeFetch(() => json({ message: "ok" }));
    const error = (await client(fetchImpl)
      .getIssue(350)
      .catch((cause: unknown) => cause)) as GithubError;
    expect(error.status).toBe(502);
  });

  it("lists open issues, skips pull requests and reads the rate limit", async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      json(
        [ISSUE, { ...ISSUE, number: 351, pull_request: { url: "x" } }, { nonsense: true }],
        200,
        {
          link: '<https://api.github.com/repositories/1/issues?page=2>; rel="next"',
          "x-ratelimit-remaining": "42",
          "x-ratelimit-reset": "1763700000",
        },
      ),
    );

    const page = await client(fetchImpl).listOpenIssues(1, 2);
    expect(page.issues.map((issue) => issue.number)).toEqual([350]);
    expect(page.hasMore).toBe(true);
    expect(page.rateLimitRemaining).toBe(42);
    expect(page.rateLimitReset).toBe(1_763_700_000);
    expect(calls[0]?.url).toBe(
      `https://api.github.com/repos/${REPOSITORY}/issues?state=open&per_page=2&page=1&sort=created&direction=asc`,
    );
  });

  it("falls back to a full page when GitHub sends no Link header", async () => {
    const { fetchImpl } = fakeFetch(() => json([ISSUE]));
    const page = await client(fetchImpl).listOpenIssues(1, 1);
    expect(page.hasMore).toBe(true);
    expect(page.rateLimitRemaining).toBeNull();
  });

  it("refuses an empty token", () => {
    expect(() =>
      createGithubClient({
        token: "  ",
        repository: REPOSITORY,
        fetchImpl: fakeFetch(() => json({})).fetchImpl,
      }),
    ).toThrow("The GitHub token is empty.");
  });
});
