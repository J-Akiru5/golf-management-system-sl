import type { Metadata } from "next";
import Link from "next/link";
import { PublicBottomBar } from "@/components/MobileTabBar";
import "@/components/landing/landing.css";
import { DemoRequestForm } from "@/components/public/DemoRequestForm";
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
    <main className="tl-demo-page mobile-bar-space">
      <header className="tl-demo-top">
        <Link href="/" aria-label="TeeLine Golf home">
          <TeeLineLogo variant="reverse" width={172} />
          <span>
            <b>TeeLine Golf</b>
            Tournament desk
          </span>
        </Link>
        <Link className="tl-demo-back" href="/">
          Back to home
        </Link>
      </header>

      <div className="tl-demo-layout">
        <section className="tl-demo-copy" aria-labelledby="demo-title">
          <p className="tl-kicker">For your tournament committee</p>
          <h1 id="demo-title">See TeeLine with your club's own event.</h1>
          <p>
            Bring your tournament workflow. We will walk through the desk and show how the pieces
            fit together.
          </p>
          <ul>
            <li>Set up entries and tournament rules.</li>
            <li>Review the proposed draw before publishing pairings.</li>
            <li>Follow score entry, checks and the public results.</li>
            <li>Ask about the steps that matter to your committee.</li>
          </ul>
        </section>
        <DemoRequestForm />
      </div>

      <PublicBottomBar />
    </main>
  );
}
