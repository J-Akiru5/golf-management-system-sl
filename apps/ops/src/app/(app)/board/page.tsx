import type { Metadata } from "next";
import { BoardView } from "@/components/board/board-view";
import { requirePageAccess } from "@/lib/access/guard";
import { levelFor } from "@/lib/access/pages";
import { currentAccess } from "@/lib/access/server";
import { getViewer } from "@/lib/auth/viewer";
import { can, type Viewer } from "@/lib/db/permissions";
import { demoMode } from "@/lib/flags";
import { getRepos } from "@/lib/repos";

export const metadata: Metadata = { title: "Pipeline" };

/**
 * The pipeline board route. The menu hides it at `none`; this guard refuses the address. The page
 * then loads the data and decides whether the viewer may see the delete control.
 */
export default async function PipelinePage() {
  await requirePageAccess("pipeline");

  const demo = demoMode();
  const access = await currentAccess();
  const canEdit = levelFor(access, "pipeline") === "edit";
  const repos = await getRepos();
  const [cards, members, tournaments] = await Promise.all([
    repos.board.listCards(),
    repos.board.listMembers(),
    repos.board.listTournaments(),
  ]);

  // Demo mode has no session. The shell shows a demo owner, so the board does the same.
  const viewer: Viewer = demo
    ? { role: "owner", status: "active" }
    : ((await getViewer())?.member ?? null);

  return (
    <BoardView
      initialCards={cards}
      members={members}
      tournaments={tournaments}
      canEdit={canEdit}
      canDelete={canEdit && can(viewer, "content.delete")}
      demo={demo}
    />
  );
}
