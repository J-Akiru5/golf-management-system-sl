import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatWhen } from "@/lib/github/format";
import type { TaskGithubLink } from "@/lib/github/types";

/**
 * The GitHub section of the task sheet: which issue this task is, what GitHub calls it, and when it
 * last agreed with this row. It is read-only: labels and the milestone are edited on GitHub, and the
 * workspace shows what came back.
 */
export function GithubLinkPanel({ link }: { link: TaskGithubLink }) {
  return (
    <section
      className="flex flex-col gap-2 border-t border-line pt-4"
      aria-labelledby="github-link"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="github-link" className="text-sm font-semibold text-ink">
          GitHub issue #{link.issueNumber}
        </h2>
        {link.url === null ? null : (
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-[13px] font-semibold text-fairway hover:underline sm:min-h-8"
          >
            Open on GitHub
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        )}
      </div>

      <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="overline">State</dt>
          <dd className="mt-1">
            {link.state === null ? (
              <span className="text-ink-muted">Not reported</span>
            ) : (
              <Badge tone={link.state === "closed" ? "neutral" : "success"}>
                {link.state === "closed" ? "Closed" : "Open"}
              </Badge>
            )}
          </dd>
        </div>
        <div>
          <dt className="overline">Milestone</dt>
          <dd className="mt-1 text-ink">{link.milestone ?? "None"}</dd>
        </div>
        <div>
          <dt className="overline">Labels</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {link.labels.length === 0 ? (
              <span className="text-ink-muted">None</span>
            ) : (
              link.labels.map((label) => (
                <Badge key={label} tone="info">
                  {label}
                </Badge>
              ))
            )}
          </dd>
        </div>
        <div>
          <dt className="overline">Assignees on GitHub</dt>
          <dd className="mt-1 text-ink">
            {link.assignees.length === 0 ? "Nobody" : link.assignees.join(", ")}
          </dd>
        </div>
        <div>
          <dt className="overline">Last sync</dt>
          <dd className="mt-1 text-ink">{formatWhen(link.syncedAt)}</dd>
        </div>
      </dl>

      <p className="hint">
        Labels and the milestone are edited on GitHub. A title, status or assignee changed here is
        sent to the issue, and a change there comes back to this task.
      </p>
    </section>
  );
}
