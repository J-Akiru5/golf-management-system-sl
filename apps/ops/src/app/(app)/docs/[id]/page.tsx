import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DocEditor } from "@/components/docs/doc-editor";
import { can } from "@/lib/db/permissions";
import type { EditorJson } from "@/lib/db/types";
import { hasDocState, readSeedContent } from "@/lib/docs/seed-file";
import { getDocsViewer, permissionsViewer } from "@/lib/docs/viewer";
import { demoMode } from "@/lib/flags";
import { getRepos } from "@/lib/repos";
import { getServerSupabase } from "@/lib/supabase/server";

/** Read once per request: the page and its metadata both need the document. */
const loadDocument = cache(async (id: string) => {
  const repos = await getRepos();
  return repos.docs.getDoc(id);
});

/**
 * The title comes from the document, and the metadata is resolved before the page streams. That is
 * why the missing-document answer belongs here: it gives a real 404 instead of a streamed shell.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!(await getDocsViewer())) notFound();
  const doc = await loadDocument(id);
  if (!doc) notFound();
  return { title: doc.title };
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const viewer = await getDocsViewer();
  if (!viewer) notFound();

  const doc = await loadDocument(id);
  if (!doc) notFound();

  const repos = await getRepos();
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
      key={doc.id}
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
