import type { Metadata } from "next";
import Link from "next/link";
import { TeeLineLogo } from "@/components/TeeLineLogo";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * The shared 404. It uses the public header and panel styles, so a missing page still looks like
 * the club's site rather than a server default.
 */
export default function NotFound() {
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
