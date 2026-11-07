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
 *
 * On a phone the frame stays short so the form is above the fold, and it respects the safe areas so
 * the logo is not under the notch and the last line is not under the home indicator.
 */
export function AuthShell({
  title,
  intro,
  children,
  clubHomeLabel = "Club home",
  backHomeLabel = "Back to club home",
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  clubHomeLabel?: string;
  backHomeLabel?: string;
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

      <section className="grid place-items-center px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:px-6 sm:py-10 lg:py-14">
        <div className="grid w-full max-w-[26rem] gap-4 sm:gap-5">
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <Link
              href="/"
              aria-label="TeeLine Golf home"
              className="inline-flex min-h-11 items-center"
            >
              <TeeLineLogo variant="light" width={152} />
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center px-1 text-[13px] font-semibold text-ink-muted hover:text-ink"
              data-testid="club-home"
            >
              {clubHomeLabel}
            </Link>
          </div>

          <Link
            href="/"
            className="hidden w-fit items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink lg:inline-flex lg:min-h-11"
            data-testid="back-home"
          >
            <span aria-hidden="true">←</span> {backHomeLabel}
          </Link>

          <header className="grid gap-1.5 sm:gap-2">
            <h1 className="text-[24px] leading-7 sm:text-[26px] sm:leading-8">{title}</h1>
            {intro && (
              <div className="text-[14px] leading-5 text-ink-muted sm:text-[13px] sm:leading-[19px]">
                {intro}
              </div>
            )}
          </header>

          {children}

          <AppVersion className="text-center" />
        </div>
      </section>
    </main>
  );
}
