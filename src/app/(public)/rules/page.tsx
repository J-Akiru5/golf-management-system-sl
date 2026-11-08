import { Download, ExternalLink, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { PublicBackLink } from "@/components/public/PublicBackLink";
import { RulesSections } from "@/components/public/RulesSections";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { BAMBOO_TEE_2026_RULES as rules } from "@/lib/public/tournament-rules";
import { openGraphFor, SITE_NAME, twitterFor } from "@/lib/seo";

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
export default function TournamentRulesPage() {
  return (
    <main className="public public-rules mobile-bar-space" data-testid="rules-page" lang="en">
      <header className="public-head rules-hero">
        <PublicBackLink label="Back to main page" />

        <div className="rules-hero-top">
          <div className="flex flex-wrap items-center gap-3">
            <TeeLineLogo variant="reverse" width={144} />
            <span className="leading-tight">
              <b className="block font-display text-[13px] font-semibold">Tournament rules</b>
              <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
            </span>
          </div>
          <span className="rules-pdf-badge">{rules.pdf.pageCount} pages · PDF</span>
        </div>

        <p className="overline mt-2 !text-gold-on-forest">
          {rules.eventName} · {rules.dates}
        </p>
        <h1 className="font-serif text-[28px] leading-8 font-semibold !text-on-forest sm:text-[44px] sm:leading-[48px] lg:text-[52px] lg:leading-[56px]">
          {rules.title}
        </h1>
        <p className="rules-hero-sub">{rules.subtitle}</p>
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

      <p className="hint no-print">
        <Link href="/">TeeLine Golf home</Link> ·{" "}
        <Link href="/pairings">Tee times and pairings</Link> ·{" "}
        <Link href="/roster">Player roster</Link> · <Link href="/leaderboard">Leaderboard</Link> ·{" "}
        <Link href="/faq">NGAP FAQ</Link>
      </p>
      <PlayerBottomBar />
    </main>
  );
}
