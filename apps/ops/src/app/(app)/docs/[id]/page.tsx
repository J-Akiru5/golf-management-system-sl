import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocEditor } from "@/components/docs/doc-editor";
import { can } from "@/lib/db/permissions";
import type { EditorJson } from "@/lib/db/types";
import { hasDocState, readSeedContent } from "@/lib/docs/seed-file";
import { getDocsViewer, permissionsViewer } from "@/lib/docs/viewer";
import { demoMode } from "@/lib/flags";
import { getRepos } from "@/lib/repos";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const viewer = await getDocsViewer();
  if (!viewer) notFound();

  const repos = await getRepos();
  const doc = await repos.docs.getDoc(id);
  if (!doc) notFound();

  const snapshots = await repos.docs.listSnapshots(id);
  const demo = demoMode();

  /**
   * The converted first document opens with its content because the first editor imports it when
   * there is no state row. Demo mode has no state table, so it starts from the newest saved version.
   */
  let seedContent: EditorJson | null = null;
  if (demo) {
    seedContent = snapshots[0]?.content ?? null;
  } else {
    const hasState = await hasDocState(await getServerSupabase(), id);
    if (!hasState) seedContent = readSeedContent(id);
  }

  return (
    <DocEditor
      docId={doc.id}
      title={doc.title}
      archived={doc.archived}
      viewer={{ id: viewer.id, displayName: viewer.displayName, role: viewer.role }}
      demo={demo}
      canDelete={can(permissionsViewer(viewer), "content.delete")}
      seedContent={seedContent}
      initialSnapshots={snapshots}
    />
  );
}
