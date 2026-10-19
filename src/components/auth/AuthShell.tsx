import Link from "next/link";
import type { ReactNode } from "react";
import { AppVersion } from "@/components/AppVersion";
import { TeeLineLogo } from "@/components/TeeLineLogo";

const POINTS = [
  [
    "One list of entries",
    "Every entry lands as Needs review, so the desk confirms it before it counts.",
  ],
  [
    "A draw a person decides",
    "The system proposes the groups; the organizer locks and publishes them.",
  ],
  [
    "Only the published list is public",
    "Players see the frozen pairings snapshot, never the live board.",
  ],
] as const;

/**
 * The shared frame for sign-in, password reset and the recovery landing: a brand panel on wide
 * screens, a compact header above the form on phones, and one "back to club home" exit.
 */
export function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      className="grid min-h-dvh bg-surface lg:grid-cols-[1.02fr_.98fr]"
      data-testid="auth-shell"
    >
      <section
        className="auth-brand hidden overflow-hidden p-10 lg:grid lg:content-between lg:gap-12 xl:p-16"
        aria-label="TeeLine Golf"
        data-testid="auth-brand"
      >
        <Link href="/" className="w-fit" aria-label="TeeLine Golf home">
          <TeeLineLogo variant="reverse" width={196} />
        </Link>

        <div className="grid max-w-[34rem] gap-7">
          <p className="text-[11px] font-bold tracking-[.18em] text-[#e0bc65] uppercase">
            Iloilo Golf &amp; Country Club
          </p>
          <h2 className="font-serif text-[clamp(2.2rem,3.4vw,3.4rem)] leading-[1.05] font-semibold">
            One desk for the whole tournament.
          </h2>
          <p className="max-w-[38ch] text-[15px] leading-6 text-[#c5d3ca]">
            Entries, the draw and the published pairings, without the spreadsheet.
          </p>
          <ul className="grid gap-3.5">
            {POINTS.map(([point, detail], index) => (
              <li key={point} className="flex gap-3">
                <span
                  className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-[#e0bc65] text-[10px] font-bold text-[#e0bc65]"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="grid gap-0.5">
                  <strong className="text-[13px] font-semibold text-[#f7f5ee]">{point}</strong>
                  <span className="text-[13px] leading-[19px] text-[#c5d3ca]">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[12px] text-[#8db39b]">TeeLine Golf · a Syntaxure Labs product</p>
      </section>

      <section className="grid place-items-center px-5 py-10 sm:py-14">
        <div className="grid w-full max-w-[26rem] gap-5">
          <div className="flex items-center justify-between gap-4 lg:hidden">
            <Link href="/" aria-label="TeeLine Golf home">
              <TeeLineLogo variant="light" width={152} />
            </Link>
            <Link
              href="/"
              className="text-[13px] text-ink-muted hover:text-ink"
              data-testid="club-home"
            >
              Club home
            </Link>
          </div>

          <Link
            href="/"
            className="hidden w-fit items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink lg:inline-flex"
            data-testid="back-home"
          >
            <span aria-hidden="true">←</span> Back to club home
          </Link>

          <header className="grid gap-2">
            <h1 className="text-[26px] leading-8">{title}</h1>
            {intro && <div className="text-[13px] leading-[19px] text-ink-muted">{intro}</div>}
          </header>

          {children}

          <AppVersion className="text-center" />
        </div>
      </section>
    </main>
  );
}
