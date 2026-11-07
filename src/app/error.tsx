"use client";

import Link from "next/link";
import { PublicHeader } from "@/components/public/PublicHeader";

/**
 * The last-resort error page for the app.
 *
 * It is a client component because Next needs the `reset` callback. It renders inside the root
 * layout, outside the route group that provides the visitor's language, so the shared header falls
 * back to English. The header is the same one every public page wears, because an error is exactly
 * when a player most needs the way back to the pairings and the leaderboard.
 */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="public">
      <PublicHeader current="" label="TeeLine Golf" homeSection />

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
