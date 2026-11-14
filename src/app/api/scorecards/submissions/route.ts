import { NextResponse } from "next/server";
import { requireScorecardAccess } from "@/lib/scorecards/access";
import { getScorecardStore, ScorecardStoreUnavailable } from "@/lib/scorecards/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SubmissionLike {
  at?: unknown;
  by?: unknown;
  cards?: unknown;
  nameOnly?: unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isSubmission(value: unknown): value is SubmissionLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The admin's queue of cards sent from the tabulation page.
 *
 * Only club staff can read it: a tabulation account may send cards, but it must not see every day's
 * submission or the admin's other data. The tabulator's own document is read through its own page.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const access = await requireScorecardAccess();
  if (!access.ok) {
    return NextResponse.json({ ok: false, message: access.message }, { status: access.status });
  }
  if (access.role !== "staff") {
    return NextResponse.json(
      { ok: false, message: "Only club staff can open the tabulator submission queue." },
      { status: 403 },
    );
  }

  try {
    const store = await getScorecardStore();
    const documents = await store.list();
    const submitted = documents.flatMap((document) => {
      const payload = document.payload as Record<string, unknown>;
      const submission = payload.submission;
      return isSubmission(submission) ? [{ document, submission }] : [];
    });
    const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
    if (slug) {
      const match = submitted.find((entry) => entry.document.slug === slug);
      if (!match) {
        return NextResponse.json(
          { ok: false, message: "That day has no tabulator submission." },
          { status: 404 },
        );
      }
      return NextResponse.json({
        ok: true,
        document: {
          slug: match.document.slug,
          event: match.document.event,
          label: match.document.label,
          updatedAt: match.document.updatedAt,
        },
        submission: match.submission,
      });
    }

    const submissions = submitted
      .map(({ document, submission }) => {
        const cards = Array.isArray(submission.cards)
          ? (submission.cards as Record<string, unknown>[])
          : [];
        const nameOnly = Array.isArray(submission.nameOnly)
          ? (submission.nameOnly as unknown[])
          : [];
        const differences = cards.filter(
          (card) =>
            card.handicapSource === "card" &&
            card.systemHcp != null &&
            String(card.hdcp) !== String(card.systemHcp),
        ).length;
        return {
          slug: document.slug,
          event: document.event,
          label: document.label,
          updatedAt: document.updatedAt,
          at: text(submission.at),
          by: text(submission.by),
          cards: cards.length,
          nameOnly: nameOnly.length,
          differences,
        };
      })
      .sort((left, right) => right.at.localeCompare(left.at));

    return NextResponse.json({ ok: true, submissions });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof ScorecardStoreUnavailable
            ? error.message
            : error instanceof Error
              ? error.message
              : "The submission queue could not be read.",
      },
      { status: 503 },
    );
  }
}
