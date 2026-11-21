"use server";

import { revalidatePath } from "next/cache";
import { type AccessLevel, isAccessLevel } from "@/lib/access/pages";
import { requireAccess } from "@/lib/access/server";
import { can } from "@/lib/db/permissions";
import type { EditorJson, SnapshotKind } from "@/lib/db/types";
import type { DocSnapshot, DocSummary } from "@/lib/docs/repo";
import { fail, messageOf, ok, type Result } from "@/lib/docs/result";
import { getDocsViewer, permissionsViewer } from "@/lib/docs/viewer";
import { emptyDocState } from "@/lib/docs/yjs-state";
import { demoMode } from "@/lib/flags";
import { getRepos } from "@/lib/repos";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Server actions for the documents area. Each one checks the membership itself: a server action is
 * its own endpoint, so the page gate is not enough. The database enforces the same rules again.
 */

const NO_ACCESS = "You do not have access to the workspace.";
const DELETE_ONLY = "Only an owner or partner can delete documents and versions.";

async function withViewer<T>(
  level: AccessLevel,
  work: (viewer: NonNullable<Awaited<ReturnType<typeof getDocsViewer>>>) => Promise<T>,
): Promise<Result<T>> {
  if (!isAccessLevel(level)) return fail(NO_ACCESS);
  const viewer = await getDocsViewer();
  if (!viewer) return fail(NO_ACCESS);
  try {
    await requireAccess("documents", level);
    return ok(await work(viewer));
  } catch (error) {
    return fail(messageOf(error));
  }
}

export async function createDocumentAction(title: string): Promise<Result<{ id: string }>> {
  return withViewer("edit", async () => {
    const repos = await getRepos();
    const doc = await repos.docs.createDoc(title);
    revalidatePath("/docs");
    return { id: doc.id };
  });
}

export async function renameDocumentAction(
  id: string,
  title: string,
): Promise<Result<{ title: string }>> {
  return withViewer("edit", async () => {
    const repos = await getRepos();
    const doc: DocSummary = await repos.docs.renameDoc(id, title);
    revalidatePath("/docs");
    revalidatePath(`/docs/${id}`);
    return { title: doc.title };
  });
}

export async function setDocumentArchivedAction(
  id: string,
  archived: boolean,
): Promise<Result<null>> {
  return withViewer("edit", async () => {
    const repos = await getRepos();
    await repos.docs.setArchived(id, archived);
    revalidatePath("/docs");
    revalidatePath(`/docs/${id}`);
    return null;
  });
}

export async function deleteDocumentAction(id: string): Promise<Result<null>> {
  return withViewer("edit", async (viewer) => {
    if (!can(permissionsViewer(viewer), "content.delete")) throw new Error(DELETE_ONLY);
    const repos = await getRepos();
    await repos.docs.deleteDoc(id);
    revalidatePath("/docs");
    return null;
  });
}

export async function listSnapshotsAction(docId: string): Promise<Result<DocSnapshot[]>> {
  return withViewer("view", async () => {
    const repos = await getRepos();
    return repos.docs.listSnapshots(docId);
  });
}

export async function createSnapshotAction(input: {
  docId: string;
  name: string;
  kind: SnapshotKind;
  state: string;
  content: EditorJson;
}): Promise<Result<DocSnapshot>> {
  return withViewer("edit", async () => {
    const repos = await getRepos();
    return repos.docs.createSnapshot(input);
  });
}

export async function deleteSnapshotAction(id: string): Promise<Result<null>> {
  return withViewer("edit", async (viewer) => {
    if (!can(permissionsViewer(viewer), "content.delete")) throw new Error(DELETE_ONLY);
    const repos = await getRepos();
    await repos.docs.deleteSnapshot(id);
    return null;
  });
}

/**
 * Claim the one seeding slot for a document that has no state row. The insert is the claim: the
 * state table's primary key lets exactly one client through, and the rest read what that client
 * writes. Demo mode has no database, so there is nothing to claim.
 */
export async function claimSeedStateAction(docId: string): Promise<Result<boolean>> {
  const viewer = await getDocsViewer();
  if (!viewer) return fail(NO_ACCESS);
  try {
    await requireAccess("documents", "edit");
  } catch (error) {
    return fail(messageOf(error));
  }
  if (demoMode()) return ok(true);

  try {
    const client = await getServerSupabase();
    const { error } = await client
      .from("ws_doc_states")
      .insert({ doc_id: docId, state: emptyDocState() });
    if (!error) return ok(true);
    if (error.code === "23505") return ok(false);
    if (error.code === "23503") return fail("That document does not exist.");
    return fail(`Could not prepare the document for its imported content: ${error.message}`);
  } catch (error) {
    return fail(messageOf(error));
  }
}
