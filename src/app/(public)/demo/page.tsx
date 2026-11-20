import type { Metadata } from "next";
import { PublicBottomBar } from "@/components/MobileTabBar";
import { DemoRequestForm } from "@/components/public/DemoRequestForm";
import { PublicBackLink } from "@/components/public/PublicBackLink";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { openGraphFor, SITE_NAME, twitterFor } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Request a demo",
  description:
    "Ask for a walkthrough of TeeLine Golf with your club's own event: entries, the draw, published pairings and live scoring.",
  alternates: { canonical: "/demo" },
  openGraph: openGraphFor({
    title: `Request a demo | ${SITE_NAME}`,
    description:
      "Ask for a walkthrough of TeeLine Golf with your club's own event: entries, the draw, published pairings and live scoring.",
    path: "/demo",
  }),
  twitter: twitterFor({
    title: `Request a demo | ${SITE_NAME}`,
    description:
      "Ask for a walkthrough of TeeLine Golf with your club's own event: entries, the draw, pairings and live scoring.",
  }),
};

/**
 * The demo request page.
 *
 * One form, and nothing is read back here. The note goes to the club's private feedback inbox with
 * the category `demo`; the database resolves the club and stores the contact details only when the
 * visitor ticked the consent box.
 */
export default function DemoPage() {
  return (
    <main className="public mobile-bar-space">
      <header className="public-head">
        <PublicBackLink label="Back to TeeLine Golf" />
        <div className="flex flex-wrap items-center gap-3">
          <TeeLineLogo variant="reverse" width={172} />
          <span className="leading-tight">
            <b className="block font-display text-[13px] font-semibold">TeeLine Golf</b>
            <span className="text-xs text-on-forest-muted">Tournament desk</span>
          </span>
        </div>
        <p className="overline mt-3 !text-gold-on-forest">Request a demo</p>
        <h1 className="font-serif text-[28px] leading-8 font-semibold !text-on-forest sm:text-[44px] sm:leading-[48px]">
          See TeeLine Golf with your club's own event.
        </h1>
        <p className="text-on-forest-muted">
          Tell us who you are and what you would like to see. We will reply and arrange a
          walkthrough of the desk, the draw, the published pairings and live scoring.
        </p>
      </header>

      <DemoRequestForm />

      <PublicBottomBar />
    </main>
  );
}
