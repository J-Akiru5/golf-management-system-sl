import { Download, ExternalLink, FileText } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PublicBottomBar } from "@/components/MobileTabBar";
import { RulesSections } from "@/components/public/RulesSections";
import { JsonLd } from "@/components/seo/JsonLd";
import { ThemeToggle } from "@/components/ThemeToggle";
import { loadEventArchive } from "@/lib/data/supabase/event-archive";
import { BAMBOO_TEE_2026_RULES as rules } from "@/lib/public/tournament-rules";
import { openGraphFor, SITE_NAME, twitterFor, webPageSchema } from "@/lib/seo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { todayInManila } from "../events/_lib/today";

export const metadata: Metadata = {
  title: "Conditions of Play",
  description:
    "The tournament rules for the 24th IGCCI Bamboo Tee Invitational: format, handicap and divisions, local rules, pace of play, scorecards, tie-breaking and prizes. The official PDF is available to download.",
  alternates: { canonical: "/rules" },
  openGraph: openGraphFor({
    title: `Conditions of Play | ${SITE_NAME}`,
    description:
      "The 24th IGCCI Bamboo Tee Invitational rules, formatted for a phone, with the official PDF to download.",
    path: "/rules",
  }),
  twitter: twitterFor({
    title: `Conditions of Play | ${SITE_NAME}`,
    description:
      "Format, local rules, pace of play, scorecards, tie-breaking and prizes for the 24th Bamboo Tee.",
  }),
};

/**
 * The public rules page.
 *
 * It is static on purpose: the rules do not change when the draw is republished, and a player
 * standing on the first tee should not need a database round trip to read them. The content lives
 * in `src/lib/public/tournament-rules.ts`; the PDF is a public asset under `public/documents`.
 *
 * This page is a reading aid. The official PDF controls if the two ever disagree, and the page says
 * so in the header and again beside the download button.
 */
/**
 * `/rules` is no longer a nav item: rules of play belong to one event. When the organizer has written
 * rules for the featured event (or, failing that, the newest event with rules), the address forwards
 * to that event's `#rules` section. Until any event carries its own rules text, it keeps showing the
 * static Conditions of Play below, so the published rules never become unreachable.
 */
export default async function RulesPage() {
  if (isSupabaseConfigured()) {
    const events =
      (await loadEventArchive(createSupabasePublicClient(), todayInManila()).catch(() => null)) ??
      [];
    const withRules = events.filter((event) => event.hasRules);
    const target = withRules.find((event) => event.featured) ?? withRules[0];
    if (target) redirect(`/events/${target.tournamentId}#rules`);
  }
  return <ConditionsOfPlay />;
}

function ConditionsOfPlay() {
  return (
    <main className="public public-rules mobile-bar-space" data-testid="rules-page" lang="en">
      <JsonLd
        data={webPageSchema({
          path: "/rules",
          name: "Conditions of Play",
          description:
            "The 24th Bamboo Tee Invitational Conditions of Play: format, handicap and divisions, local rules, pace of play, scorecards, tie-breaking and prizes, with the official PDF.",
        })}
      />
      <header className="public-head rules-hero tl-pub-page-head">
        <div className="rules-hero-top">
          <p className="tl-pub-kicker">
            {rules.eventName} · {rules.dates}
          </p>
          <div className="flex items-center gap-3">
            <span className="rules-pdf-badge">{rules.pdf.pageCount} pages · PDF</span>
            <ThemeToggle compact tone="nav" />
          </div>
        </div>

        <h1 className="tl-pub-title">{rules.title}</h1>
        <p className="rules-hero-sub tl-pub-intro">{rules.subtitle}</p>
        <p className="rules-hero-meta">
          {rules.venue} · The official rules are published in English.
        </p>

        <div className="rules-actions">
          <a
            className="btn gold"
            href={rules.pdf.href}
            download={rules.pdf.fileName}
            data-testid="rules-download"
          >
            <Download className="size-4" aria-hidden="true" />
            Download PDF
          </a>
          <a
            className="btn ghost rules-open-pdf"
            href={rules.pdf.href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="rules-open-pdf"
          >
            <FileText className="size-4" aria-hidden="true" />
            Open official PDF
          </a>
        </div>
      </header>

      <section className="card rules-glance" aria-labelledby="rules-glance-title">
        <div className="rules-section-heading">
          <div>
            <h2 id="rules-glance-title">At a glance</h2>
            <p className="hint m-0">The facts players check first.</p>
          </div>
          <span className="pill">12-15 Nov 2026</span>
        </div>
        <dl className="rules-facts">
          {rules.quickFacts.map((fact) => (
            <div key={fact.term}>
              <dt>{fact.term}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <RulesSections sections={rules.sections} />

      <section className="card rules-source-card" aria-labelledby="rules-source-title">
        <span className="rules-source-mark" aria-hidden="true">
          <FileText className="size-5" />
        </span>
        <div className="rules-source-copy">
          <h2 id="rules-source-title">The official document</h2>
          <p>
            This page is a reading aid prepared from the organizers&rsquo;{" "}
            {`${rules.pdf.pageCount}-page`} Conditions of Play. If anything here differs from the
            PDF, the PDF controls.
          </p>
          <p className="hint m-0">
            The PDF is {rules.pdf.pageCount} pages and opens in a new tab. Save a copy before you
            travel to the course.
          </p>
        </div>
        <div className="rules-source-actions">
          <a className="btn" href={rules.pdf.href} download={rules.pdf.fileName}>
            <Download className="size-4" aria-hidden="true" />
            Download PDF
          </a>
          <a className="btn ghost" href={rules.pdf.href} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" aria-hidden="true" />
            View PDF
          </a>
        </div>
      </section>

      <PublicBottomBar />
    </main>
  );
}
