/**
 * The course-map lifecycle, as code.
 *
 * The database is the authority: `record_course_map_review` and `publish_course_map` enforce the same
 * rules inside one transaction (see `supabase/migrations/20261034000000_course_maps.sql`). This module
 * exists so the screen can say what is allowed before a button is pressed, and so the rules can be
 * tested without a database. If the two ever disagree, the database wins — and the test below is the
 * place to notice.
 *
 * The lifecycle:
 *
 *   draft ──technical confirmed──▶ awaiting_technical* ──▶ awaiting_validation ──validation confirmed──▶ approved ──publish──▶ published
 *     ▲                                    │                              │
 *     └──────── changes requested ─────────┘ (technical)                  └── changes requested ──▶ rejected
 *
 * * `awaiting_technical` is the state a draft is moved to when it has been sent for technical review;
 *   in this first version the screen records the review directly, so a map normally goes
 *   draft → awaiting_validation → approved. The name stays because a future "send for review" step
 *   needs it.
 */

export type CourseMapStatus =
  | "draft"
  | "awaiting_technical"
  | "awaiting_validation"
  | "approved"
  | "published"
  | "superseded"
  | "rejected";

export const COURSE_MAP_STATUSES: readonly CourseMapStatus[] = [
  "draft",
  "awaiting_technical",
  "awaiting_validation",
  "approved",
  "published",
  "superseded",
  "rejected",
];

export function isCourseMapStatus(value: unknown): value is CourseMapStatus {
  return typeof value === "string" && (COURSE_MAP_STATUSES as readonly string[]).includes(value);
}

export type ReviewKind = "technical" | "validation";
export type ReviewDecision = "confirmed" | "changes_requested";

export interface CourseMapReview {
  kind: ReviewKind;
  decision: ReviewDecision;
  /** ISO timestamp, or null when the record does not carry one yet. */
  at: string | null;
}

/**
 * What a person reads, not what the database stores. The two reviewers are named because the club
 * asked for them by name; the app records their confirmation, it does not grant them accounts.
 */
export const COURSE_MAP_STATUS_LABEL: Record<CourseMapStatus, string> = {
  draft: "Draft — not checked",
  awaiting_technical: "Awaiting Sir Philip's technical confirmation",
  awaiting_validation: "Awaiting Ma'am Mary Ann's validation",
  approved: "Approved — ready to publish",
  published: "Published",
  superseded: "Superseded by a newer version",
  rejected: "Rejected — needs a new version",
};

export const REVIEW_KIND_LABEL: Record<ReviewKind, string> = {
  technical: "Technical confirmation",
  validation: "Validation",
};

const CLOSED: readonly CourseMapStatus[] = ["published", "superseded", "rejected"];

export type Transition = { ok: true; status: CourseMapStatus } | { ok: false; reason: string };

/**
 * The status after a review is recorded. Refusals are explicit: a duplicate confirmation, a review on
 * a closed version, or a validation before the technical one all say why rather than doing nothing.
 */
export function nextStatusAfterReview(
  current: CourseMapStatus,
  kind: ReviewKind,
  decision: ReviewDecision,
): Transition {
  if (!isCourseMapStatus(current)) {
    return { ok: false, reason: "Unknown map status." };
  }

  if (CLOSED.includes(current)) {
    return {
      ok: false,
      reason:
        current === "published"
          ? "A published map is fixed. Create a new version instead."
          : "This version is closed. Create a new version instead.",
    };
  }

  if (decision === "changes_requested") {
    // A technical change request sends the draft back to work; a validation change request closes the
    // proposed version as rejected, so it stays distinguishable from a draft being revised.
    return { ok: true, status: kind === "validation" ? "rejected" : "draft" };
  }

  if (kind === "technical") {
    if (current === "draft" || current === "awaiting_technical") {
      return { ok: true, status: "awaiting_validation" };
    }
    return {
      ok: false,
      reason: "The technical confirmation is already recorded for this version.",
    };
  }

  if (current === "awaiting_validation") {
    return { ok: true, status: "approved" };
  }
  return { ok: false, reason: "Record Sir Philip's technical confirmation first." };
}

/**
 * The latest review of a kind. Ordering uses the timestamp when present (ISO strings compare as
 * text), and falls back to position in the list, which the database returns oldest first.
 */
export function latestReview(
  reviews: readonly CourseMapReview[],
  kind: ReviewKind,
): CourseMapReview | null {
  let latest: CourseMapReview | null = null;
  for (const review of reviews) {
    if (review.kind !== kind) continue;
    if (latest === null) {
      latest = review;
      continue;
    }
    const a = review.at;
    const b = latest.at;
    if (a === null) continue; // an undated older record never replaces a dated newer one
    if (b === null || a >= b) latest = review;
  }
  return latest;
}

/**
 * Whether an approved map may be published: it must be approved, and the most recent decision of each
 * kind must still be a confirmation. A later change request wins, so an approval cannot be outlived by
 * edits (the database also clears the stamps and returns the map to draft when holes change).
 */
export function canPublish(
  status: CourseMapStatus,
  reviews: readonly CourseMapReview[],
): { ok: boolean; reason: string | null } {
  if (status !== "approved") {
    return { ok: false, reason: "Only an approved map can be published." };
  }
  const technical = latestReview(reviews, "technical");
  if (technical?.decision !== "confirmed") {
    return { ok: false, reason: "A technical confirmation is needed before publishing." };
  }
  const validation = latestReview(reviews, "validation");
  if (validation?.decision !== "confirmed") {
    return { ok: false, reason: "A validation is needed before publishing." };
  }
  return { ok: true, reason: null };
}

/** Whether a map is the official one the app may show. There is at most one per course. */
export function isPublishedMap(status: CourseMapStatus): boolean {
  return status === "published";
}

/** Whether the map is waiting on a person, which is what the desk's attention list cares about. */
export function isWaitingOnReview(status: CourseMapStatus): boolean {
  return status === "awaiting_technical" || status === "awaiting_validation";
}
