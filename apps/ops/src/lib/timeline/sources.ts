import { demoMode } from "@/lib/flags";
import { getRepos } from "@/lib/repos";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  ARCHIVE_FUNCTIONS,
  demoGithub,
  demoTournaments,
  parseArchiveEvents,
  publicSiteBase,
} from "./archive";
import { type GithubFeed, loadGithubFeed } from "./github";
import {
  buildTimeline,
  cardItems,
  milestoneItems,
  releaseItems,
  taskItems,
  tournamentItems,
} from "./items";
import type { TimelineItem, TournamentSource } from "./types";

/**
 * Everything the Timeline page shows, built on the server.
 *
 * Cards, tasks and member names come from the repositories the rest of the workspace uses, so the
 * signed-in person's row level security applies. Tournaments come from the public event function,
 * read with the same session and never with a service role. GitHub is optional and its absence is
 * not an error.
 *
 * Nothing here reads the live draw or the live board: the tournament list is the announced-event
 * list the public site publishes.
 */

export type TimelineMember = { id: string; name: string };

export type TimelineData = {
  items: TimelineItem[];
  members: TimelineMember[];
  /** The GitHub answer. `unconfigured` and `error` both render as one quiet line. */
  github: GithubFeed;
  /**
   * True when both tournament reads failed. The page still shows the cards, tasks and GitHub rows,
   * and says that the tournament list could not be read.
   */
  tournamentsFailed: boolean;
};

type RpcAnswer = { data: unknown; error: { message: string } | null };

type ArchiveClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcAnswer>;
};

async function loadTournaments(): Promise<{
  tournaments: TournamentSource[];
  failed: boolean;
}> {
  if (demoMode()) return { tournaments: demoTournaments(), failed: false };

  try {
    const client = (await getServerSupabase()) as unknown as ArchiveClient;

    for (const name of ARCHIVE_FUNCTIONS) {
      const answer = await client.rpc(name);
      if (answer.error === null)
        return { tournaments: parseArchiveEvents(answer.data), failed: false };
    }

    return { tournaments: [], failed: true };
  } catch {
    return { tournaments: [], failed: true };
  }
}

function memberNames(
  members: ReadonlyArray<{ user_id: string; display_name: string }>,
): TimelineMember[] {
  const seen = new Map<string, string>();
  for (const member of members) {
    if (member.user_id === "") continue;
    seen.set(member.user_id, member.display_name);
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadTimelineSources(today: string): Promise<TimelineData> {
  const demo = demoMode();
  const repos = await getRepos();

  const [cards, tasks, members, github, tournaments] = await Promise.all([
    repos.board.listCards(),
    repos.tasks.listTasks(),
    repos.board.listMembers(),
    demo ? Promise.resolve<GithubFeed>({ status: "ok", ...demoGithub() }) : loadGithubFeed(),
    loadTournaments(),
  ]);

  const items = buildTimeline({
    tournaments: tournamentItems(tournaments.tournaments, {
      publicBase: publicSiteBase(),
      today,
    }),
    cards: cardItems(cards),
    tasks: taskItems(tasks),
    milestones: milestoneItems(github.status === "ok" ? github.milestones : []),
    releases: releaseItems(github.status === "ok" ? github.releases : []),
  });

  return {
    items,
    members: memberNames(members),
    github,
    tournamentsFailed: tournaments.failed,
  };
}
