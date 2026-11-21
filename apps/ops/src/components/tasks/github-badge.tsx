import { GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TaskGithubLink } from "@/lib/github/types";

/**
 * The GitHub mark on a linked task.
 *
 * The issue number is the link to GitHub. Labels and the milestone are shown beside it, because a
 * person reading the board should not have to open the issue to see where the work belongs. Nothing
 * here is invented: the labels and the milestone are what GitHub last reported.
 */

function issueHref(link: TaskGithubLink): string | null {
  if (link.url !== null && link.url.startsWith("https://")) return link.url;
  return null;
}

function LabelChips({ labels, limit }: { labels: ReadonlyArray<string>; limit: number | null }) {
  const shown = limit === null ? labels : labels.slice(0, limit);
  const rest = labels.length - shown.length;

  return (
    <>
      {shown.map((label) => (
        <Badge key={label} tone="info">
          {label}
        </Badge>
      ))}
      {rest > 0 ? (
        <span className="text-[12px] text-ink-muted" aria-label={`${rest} more labels`}>
          +{rest}
        </span>
      ) : null}
    </>
  );
}

/**
 * `compact` is for a board card: the number, the milestone and at most two labels. The full form is
 * for the list row and the detail sheet.
 */
export function GithubBadge({
  link,
  compact = false,
}: {
  link: TaskGithubLink;
  compact?: boolean;
}) {
  const href = issueHref(link);
  const number = `#${link.issueNumber}`;

  const body = (
    <>
      <GitBranch className="size-3.5" aria-hidden="true" />
      <span className="tnum">{number}</span>
      {link.state === "closed" ? <span className="font-normal">closed</span> : null}
      {link.milestone === null ? null : <span className="font-normal">{link.milestone}</span>}
    </>
  );

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      {href === null ? (
        <Badge tone="gold" className="min-h-6">
          {body}
        </Badge>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`GitHub issue ${link.issueNumber}${link.state === "closed" ? ", closed" : ""}`}
          className="inline-flex min-h-11 items-center gap-1 rounded-sm bg-gold-soft px-2 text-[12px] font-bold text-gold-ink hover:underline sm:min-h-6"
        >
          {body}
        </a>
      )}
      <LabelChips labels={link.labels} limit={compact ? 2 : null} />
    </span>
  );
}
