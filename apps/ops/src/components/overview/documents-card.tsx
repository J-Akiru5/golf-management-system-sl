import Link from "next/link";
import { formatWhen } from "@/lib/docs/format";
import type { DocSummary } from "@/lib/docs/repo";
import { OverviewCard } from "./overview-card";

/** The five most recently edited live documents. Each row opens the editor. */
export function DocumentsCard({ docs }: { docs: DocSummary[] }) {
  return (
    <OverviewCard
      title="Documents"
      description="The shared documents edited most recently."
      href="/docs"
      linkLabel="All documents"
    >
      {docs.length === 0 ? (
        <p className="hint">No documents yet. Start one on the documents page.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line border-t border-line">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/docs/${doc.id}`}
                className="flex min-h-11 flex-col justify-center gap-0.5 py-2"
              >
                <span className="truncate text-sm font-semibold text-ink hover:underline">
                  {doc.title}
                </span>
                <span className="text-xs text-ink-muted">
                  Edited {formatWhen(doc.updatedAt)}
                  {doc.lastEditedByName ? ` by ${doc.lastEditedByName}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}
