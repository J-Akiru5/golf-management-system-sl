import { describe, expect, it } from "vitest";
import {
  COURSE_MAP_STATUS_LABEL,
  COURSE_MAP_STATUSES,
  type CourseMapReview,
  type CourseMapStatus,
  canPublish,
  isCourseMapStatus,
  isPublishedMap,
  isWaitingOnReview,
  latestReview,
  nextStatusAfterReview,
} from "./map-lifecycle";

const confirmed = (
  kind: "technical" | "validation",
  at = "2026-10-20T09:00:00Z",
): CourseMapReview => ({
  kind,
  decision: "confirmed",
  at,
});

const changes = (
  kind: "technical" | "validation",
  at = "2026-10-20T09:00:00Z",
): CourseMapReview => ({
  kind,
  decision: "changes_requested",
  at,
});

describe("nextStatusAfterReview", () => {
  it("walks a draft through the confirmations in order", () => {
    expect(nextStatusAfterReview("draft", "technical", "confirmed")).toEqual({
      ok: true,
      status: "awaiting_validation",
    });
    expect(nextStatusAfterReview("awaiting_technical", "technical", "confirmed")).toEqual({
      ok: true,
      status: "awaiting_validation",
    });
    expect(nextStatusAfterReview("awaiting_validation", "validation", "confirmed")).toEqual({
      ok: true,
      status: "approved",
    });
  });

  it("refuses a validation before the technical confirmation", () => {
    const result = nextStatusAfterReview("draft", "validation", "confirmed");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/technical confirmation/i);
  });

  it("refuses a duplicate confirmation instead of silently doing nothing", () => {
    expect(nextStatusAfterReview("awaiting_validation", "technical", "confirmed").ok).toBe(false);
    expect(nextStatusAfterReview("approved", "validation", "confirmed").ok).toBe(false);
  });

  it("sends a technical change request back to draft, and closes a rejected validation", () => {
    expect(nextStatusAfterReview("awaiting_validation", "technical", "changes_requested")).toEqual({
      ok: true,
      status: "draft",
    });
    expect(nextStatusAfterReview("awaiting_validation", "validation", "changes_requested")).toEqual(
      {
        ok: true,
        status: "rejected",
      },
    );
  });

  it("refuses any review on a closed version, and says which kind of closed", () => {
    const published = nextStatusAfterReview("published", "validation", "confirmed");
    expect(published.ok).toBe(false);
    if (!published.ok) expect(published.reason).toMatch(/published map is fixed/i);

    for (const closed of ["superseded", "rejected"] as const) {
      const result = nextStatusAfterReview(closed, "technical", "confirmed");
      expect(result.ok, closed).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/closed/i);
    }
  });

  it("refuses an unknown status rather than guessing", () => {
    const result = nextStatusAfterReview("nonsense" as CourseMapStatus, "technical", "confirmed");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unknown/i);
  });
});

describe("latestReview", () => {
  it("returns the newest decision of that kind, whatever order it arrives in", () => {
    const reviews = [
      changes("validation", "2026-10-20T10:00:00Z"),
      confirmed("validation", "2026-10-20T09:00:00Z"),
    ];
    expect(latestReview(reviews, "validation")?.decision).toBe("changes_requested");
    expect(latestReview([...reviews].reverse(), "validation")?.decision).toBe("changes_requested");
  });

  it("keeps the two kinds apart", () => {
    const reviews = [confirmed("technical"), confirmed("validation")];
    expect(latestReview(reviews, "technical")?.kind).toBe("technical");
    expect(latestReview(reviews, "validation")?.kind).toBe("validation");
    expect(latestReview([confirmed("technical")], "validation")).toBeNull();
  });

  it("never lets an undated record replace a dated one", () => {
    const reviews = [
      { kind: "technical" as const, decision: "changes_requested" as const, at: null },
      confirmed("technical", "2026-10-20T09:00:00Z"),
    ];
    expect(latestReview(reviews, "technical")?.decision).toBe("confirmed");
  });

  it("returns null when there is nothing of that kind", () => {
    expect(latestReview([], "technical")).toBeNull();
  });
});

describe("canPublish", () => {
  const both = [confirmed("technical"), confirmed("validation")];

  it("allows an approved map whose latest decisions are both confirmations", () => {
    expect(canPublish("approved", both)).toEqual({ ok: true, reason: null });
  });

  it("refuses a map that is not approved yet", () => {
    const result = canPublish("awaiting_validation", both);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/approved/i);
  });

  it("refuses when either confirmation is missing", () => {
    expect(canPublish("approved", [confirmed("technical")]).ok).toBe(false);
    expect(canPublish("approved", [confirmed("validation")]).ok).toBe(false);
    expect(canPublish("approved", []).ok).toBe(false);
  });

  it("lets a later change request override an earlier confirmation", () => {
    const reviews = [
      confirmed("technical", "2026-10-20T09:00:00Z"),
      confirmed("validation", "2026-10-20T09:05:00Z"),
      changes("validation", "2026-10-20T11:00:00Z"),
    ];
    const result = canPublish("approved", reviews);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/validation/i);
  });
});

describe("the rest of the vocabulary", () => {
  it("labels every status, so no screen has to invent wording", () => {
    for (const status of COURSE_MAP_STATUSES) {
      expect(COURSE_MAP_STATUS_LABEL[status]).toBeTruthy();
      expect(isCourseMapStatus(status)).toBe(true);
    }
    expect(Object.keys(COURSE_MAP_STATUS_LABEL).sort()).toEqual([...COURSE_MAP_STATUSES].sort());
  });

  it("rejects anything that is not a status", () => {
    for (const junk of [null, undefined, "", "published ", "PUBLISHED", 3, {}]) {
      expect(isCourseMapStatus(junk), String(junk)).toBe(false);
    }
  });

  it("only calls a published map official, and only waiting states attention", () => {
    expect(isPublishedMap("published")).toBe(true);
    for (const other of ["draft", "approved", "superseded", "rejected"] as const) {
      expect(isPublishedMap(other), other).toBe(false);
    }
    expect(isWaitingOnReview("awaiting_technical")).toBe(true);
    expect(isWaitingOnReview("awaiting_validation")).toBe(true);
    expect(isWaitingOnReview("draft")).toBe(false);
    expect(isWaitingOnReview("approved")).toBe(false);
  });
});
