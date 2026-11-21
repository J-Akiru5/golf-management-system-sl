import { isDay } from "./dates";
import type { MilestoneSource, ReleaseSource } from "./types";

/**
 * The development milestones and releases, read from GitHub on the server.
 *
 * Two lists, both public: milestones with a due date and published releases. A milestone without a
 * due date cannot be drawn on a timeline, so it is left out. Nothing here reads a credential from
 * the code: the token comes from `GITHUB_TOKEN`, and without it the page says so quietly instead of
 * showing an error.
 *
 * The reads are cached for ten minutes, twice over: Next's own fetch cache (`revalidate`) and a
 * module-level timestamp, which also covers a runtime that is not Next.
 */

export type GithubMilestone = MilestoneSource;
export type GithubRelease = ReleaseSource;

export type GithubFeed =
  | { status: "unconfigured"; message: string }
  | { status: "ok"; milestones: GithubMilestone[]; releases: GithubRelease[] }
  | { status: "error"; message: string };

export const GITHUB_CACHE_MS = 10 * 60 * 1000;

/** The repository this workspace tracks. Override with `GITHUB_REPO`. */
export const GITHUB_DEFAULT_REPO = "J-Akiru5/golf-management-system-sl";

export const GITHUB_UNCONFIGURED_MESSAGE = "Connect GitHub to show milestones.";
export const GITHUB_ERROR_MESSAGE =
  "GitHub could not be read just now. The other items are shown as usual.";

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

type JsonResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

export type FetchLike = (url: string, init?: RequestInit) => Promise<JsonResponse>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The day a GitHub timestamp falls on, or null. */
function timestampDay(value: unknown): string | null {
  const raw = text(value);
  if (raw === "") return null;
  const day = raw.slice(0, 10);
  return isDay(day) ? day : null;
}

/**
 * Milestones that can be placed: a due date, a number, a title and a link. Anything else is
 * dropped rather than guessed.
 */
export function parseMilestones(payload: unknown): GithubMilestone[] {
  if (!Array.isArray(payload)) return [];

  const milestones: GithubMilestone[] = [];
  for (const row of payload) {
    if (!isRecord(row)) continue;
    const number = row.number;
    const title = text(row.title);
    const dueOn = timestampDay(row.due_on);
    const url = text(row.html_url);
    const state = row.state;

    if (typeof number !== "number" || !Number.isInteger(number)) continue;
    if (title === "" || dueOn === null || url === "") continue;
    if (state !== "open" && state !== "closed") continue;

    milestones.push({ number, title, dueOn, state, url });
  }

  return milestones.sort((a, b) => {
    if (a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1;
    return a.number - b.number;
  });
}

/** Published releases only: a draft has no public day, so it has no place on the timeline. */
export function parseReleases(payload: unknown): GithubRelease[] {
  if (!Array.isArray(payload)) return [];

  const releases: GithubRelease[] = [];
  for (const row of payload) {
    if (!isRecord(row)) continue;
    if (row.draft === true) continue;

    const tag = text(row.tag_name);
    const publishedOn = timestampDay(row.published_at);
    const url = text(row.html_url);
    if (tag === "" || publishedOn === null || url === "") continue;

    releases.push({
      tag,
      name: text(row.name),
      publishedOn,
      url,
      prerelease: row.prerelease === true,
    });
  }

  return releases.sort((a, b) => {
    if (a.publishedOn !== b.publishedOn) return a.publishedOn < b.publishedOn ? -1 : 1;
    return a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0;
  });
}

let cached: { at: number; feed: GithubFeed } | null = null;

/** For a test, and for a page that wants a fresh read. */
export function resetGithubCache(): void {
  cached = null;
}

export type GithubOptions = {
  /** Defaults to `process.env.GITHUB_TOKEN`. Never logged, never stored. */
  token?: string | undefined;
  /** Defaults to `GITHUB_REPO`, then the repository this workspace tracks. */
  repo?: string | undefined;
  fetcher?: FetchLike;
  /** The clock, so a test can decide when the cache expires. */
  now?: number;
};

function configuredToken(options: GithubOptions): string {
  const value = options.token ?? process.env.GITHUB_TOKEN ?? "";
  return value.trim();
}

function configuredRepo(options: GithubOptions): string {
  const value = (options.repo ?? process.env.GITHUB_REPO ?? "").trim();
  return value === "" ? GITHUB_DEFAULT_REPO : value;
}

async function readList(
  fetcher: FetchLike,
  url: string,
  token: string,
): Promise<{ ok: true; data: unknown } | { ok: false }> {
  const init: RequestInit & { next?: { revalidate: number } } = {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "teeline-ops",
    },
    // The 10-minute cache the brief asks for, in Next's data cache.
    next: { revalidate: GITHUB_CACHE_MS / 1000 },
  };

  const response = await fetcher(url, init);
  if (!response.ok) return { ok: false };
  return { ok: true, data: await response.json() };
}

async function readFeed(options: GithubOptions, repo: string, token: string): Promise<GithubFeed> {
  const fetcher = options.fetcher ?? (fetch as unknown as FetchLike);
  const base = `https://api.github.com/repos/${repo}`;

  try {
    const [milestones, releases] = await Promise.all([
      readList(
        fetcher,
        `${base}/milestones?state=all&sort=due_on&direction=asc&per_page=100`,
        token,
      ),
      readList(fetcher, `${base}/releases?per_page=100`, token),
    ]);

    if (!milestones.ok || !releases.ok) {
      return { status: "error", message: GITHUB_ERROR_MESSAGE };
    }

    return {
      status: "ok",
      milestones: parseMilestones(milestones.data),
      releases: parseReleases(releases.data),
    };
  } catch {
    // A network failure is not worth a stack trace on a page that has other things to show.
    return { status: "error", message: GITHUB_ERROR_MESSAGE };
  }
}

/**
 * The milestones and releases, or the reason there are none. Without a token this is
 * `unconfigured`, which the page shows as one quiet line rather than an error.
 */
export async function loadGithubFeed(options: GithubOptions = {}): Promise<GithubFeed> {
  const token = configuredToken(options);
  if (token === "") {
    return { status: "unconfigured", message: GITHUB_UNCONFIGURED_MESSAGE };
  }

  const repo = configuredRepo(options);
  if (!REPO_PATTERN.test(repo)) {
    return { status: "error", message: GITHUB_ERROR_MESSAGE };
  }

  const now = options.now ?? Date.now();
  if (cached !== null && now - cached.at < GITHUB_CACHE_MS) return cached.feed;

  const feed = await readFeed(options, repo, token);
  // A failure is not cached, so the next request tries again.
  if (feed.status === "ok") cached = { at: now, feed };
  return feed;
}
