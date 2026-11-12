"use client";

import Link from "next/link";

export type ScoresTab = "enter" | "review" | "results";

const TABS: readonly { key: ScoresTab; href: string; label: string }[] = [
  { key: "enter", href: "/scores", label: "Enter card" },
  { key: "review", href: "/scores/review", label: "Review" },
  { key: "results", href: "/scores/results", label: "Results" },
];

/** The three scoring work areas. The active tab is always visible above the page body. */
export function ScoresSubnav({ active }: { active: ScoresTab }) {
  return (
    <nav
      aria-label="Scoring sections"
      className="flex flex-wrap items-center gap-2 border-b border-line pb-3"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? "page" : undefined}
          className={
            active === tab.key ? "btn small bg-primary text-on-primary" : "btn ghost small text-ink"
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
