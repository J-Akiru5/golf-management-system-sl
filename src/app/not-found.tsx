import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/public/PublicHeader";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * The shared 404. It wears the same header as every public page, so a bad link still shows the
 * club's logo and the way back to pairings, the leaderboard and home. The header falls back to
 * English here because this surface renders outside the route group that reads the saved language.
 */
export default function NotFound() {
  return (
    <main className="public">
      <PublicHeader current="" label="TeeLine Golf" homeSection />

      <section className="pairings-empty" role="status">
        <h1 className="m-0 font-serif text-[26px] leading-8 font-semibold sm:text-[32px] sm:leading-10">
          We could not find that page
        </h1>
        <p>
          It may have moved, or the link may be wrong. The pairings and home page are still here.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link className="btn" href="/pairings">
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
