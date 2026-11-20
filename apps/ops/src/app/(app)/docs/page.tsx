import type { Metadata } from "next";
import { DocsList } from "@/components/docs/docs-list";
import { can } from "@/lib/db/permissions";
import { getDocsViewer, permissionsViewer } from "@/lib/docs/viewer";
import { getRepos } from "@/lib/repos";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawSearch = params.q;
  const search = (typeof rawSearch === "string" ? rawSearch : "").trim();
  const archived = params.archived === "1";

  const viewer = await getDocsViewer();
  // The layout gate answers first. This keeps the page honest if it is ever reached another way.
  if (!viewer) {
    return <p className="hint">You do not have access to the workspace.</p>;
  }

  const repos = await getRepos();
  const docs = await repos.docs.listDocs({ archived, search });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="overline">Documents</p>
          <h1 className="mt-1 text-2xl">{archived ? "Archived documents" : "Shared documents"}</h1>
          <p className="hint mt-1">
            Everyone in the workspace edits the same live copy. Save a version before a big change.
          </p>
        </div>
        <p className="hint tnum">
          {docs.length} {docs.length === 1 ? "document" : "documents"}
        </p>
      </div>

      <DocsList
        docs={docs}
        archived={archived}
        search={search}
        canDelete={can(permissionsViewer(viewer), "content.delete")}
      />
    </div>
  );
}
