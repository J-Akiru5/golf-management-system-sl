"use client";

import Link from "next/link";
import { TeeLineLogo } from "@/components/TeeLineLogo";

/**
 * The last-resort error page for the app.
 *
 * It is a client component because Next needs the `reset` callback. It renders inside the root
 * layout, so it carries its own club header rather than relying on a route group's chrome.
 */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="public">
      <header className="public-head">
        <div className="flex flex-wrap items-center gap-3">
          <TeeLineLogo variant="reverse" width={172} />
          <span className="leading-tight">
            <b className="block font-display text-[13px] font-semibold">TeeLine Golf</b>
            <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
          </span>
        </div>
      </header>

      <section className="pairings-empty" role="alert">
        <h1 className="m-0 font-serif text-[26px] leading-8 font-semibold sm:text-[32px] sm:leading-10">
          This page could not be loaded
        </h1>
        <p>
          The rest of the club's pages still work. Try again, or open the pairings or home page.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn" onClick={reset}>
            Try again
          </button>
          <Link className="btn ghost" href="/pairings">
            Pairings
          </Link>
          <Link className="btn ghost" href="/">
            Home
          </Link>
        </div>
      </section>
    </main>
  );
}
