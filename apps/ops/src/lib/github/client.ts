import { isPullRequest, parseGithubIssue } from "./issue";
import type { GithubIssue } from "./types";

/**
 * The GitHub REST calls the sync needs, and nothing else.
 *
 * `fetch` is injected so a test can answer without a network. The token is put in the Authorization
 * header and never appears in an error, a log line or a returned value: an error carries GitHub's
 * own message (which is about the request, not the credential) and the status code.
 */

export const GITHUB_API = "https://api.github.com";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type GithubIssuePatch = {
  title?: string;
  state?: "open" | "closed";
  /** All the issue's assignees. An empty array unassigns. */
  assignees?: string[];
  labels?: string[];
};

export type GithubIssuePage = {
  issues: GithubIssue[];
  /** True when GitHub says another page exists. */
  hasMore: boolean;
  /** From x-ratelimit-remaining; null when the header is absent. */
  rateLimitRemaining: number | null;
  /** From x-ratelimit-reset, in seconds since the epoch; null when absent. */
  rateLimitReset: number | null;
};

export type GithubClient = {
  getIssue(number: number): Promise<GithubIssue>;
  updateIssue(number: number, patch: GithubIssuePatch): Promise<GithubIssue>;
  listOpenIssues(page: number, perPage?: number): Promise<GithubIssuePage>;
};

export class GithubError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GithubError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** GitHub's message, cut short, or a plain sentence. Never includes a header or a token. */
function messageFor(body: unknown, status: number): string {
  if (isRecord(body) && typeof body.message === "string" && body.message.trim() !== "") {
    const message = body.message.trim();
    return message.length > 200 ? `${message.slice(0, 200)}...` : message;
  }
  return `GitHub answered ${status}.`;
}

function headerNumber(response: Response, name: string): number | null {
  const raw = response.headers.get(name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function hasNextPage(response: Response): boolean {
  const link = response.headers.get("link");
  return link !== null && /rel="next"/.test(link);
}

export function createGithubClient(options: {
  token: string;
  repository: string;
  fetchImpl?: FetchLike;
  apiBase?: string;
}): GithubClient {
  const fetcher = options.fetchImpl ?? fetch;
  const apiBase = (options.apiBase ?? GITHUB_API).replace(/\/$/, "");
  const token = options.token.trim();
  if (token === "") throw new Error("The GitHub token is empty.");

  async function request(
    path: string,
    init: { method?: string; body?: string } = {},
  ): Promise<{ response: Response; body: unknown }> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "teeline-workspace",
    };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetcher(`${apiBase}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body,
      cache: "no-store",
    });

    const text = await response.text();
    let body: unknown = null;
    if (text !== "") {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = null;
      }
    }

    if (!response.ok) throw new GithubError(response.status, messageFor(body, response.status));
    return { response, body };
  }

  return {
    async getIssue(number) {
      const { body } = await request(`/repos/${options.repository}/issues/${number}`);
      const issue = parseGithubIssue(body);
      if (!issue) throw new GithubError(502, "GitHub returned an issue that could not be read.");
      return issue;
    },

    async updateIssue(number, patch) {
      const { body } = await request(`/repos/${options.repository}/issues/${number}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      const issue = parseGithubIssue(body);
      if (!issue) throw new GithubError(502, "GitHub returned an issue that could not be read.");
      return issue;
    },

    async listOpenIssues(page, perPage = 100) {
      const { response, body } = await request(
        `/repos/${options.repository}/issues?state=open&per_page=${perPage}&page=${page}&sort=created&direction=asc`,
      );

      const raw = Array.isArray(body) ? body : [];
      const issues: GithubIssue[] = [];
      for (const item of raw) {
        if (isPullRequest(item)) continue;
        const issue = parseGithubIssue(item);
        if (issue) issues.push(issue);
      }

      return {
        issues,
        hasMore: hasNextPage(response) || raw.length === perPage,
        rateLimitRemaining: headerNumber(response, "x-ratelimit-remaining"),
        rateLimitReset: headerNumber(response, "x-ratelimit-reset"),
      };
    },
  };
}
