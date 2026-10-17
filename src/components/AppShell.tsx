"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/players", label: "Players" },
  { href: "/import", label: "Import handicaps" },
  { href: "/draw", label: "Draw" },
  { href: "/setup", label: "Setup" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="frame">
      <aside className="side">
        <Link href="/" className="brand">
          <Logo />
          <span>
            <span className="brand-name">Starter</span>
            <br />
            <span className="brand-sub">Iloilo Golf &amp; CC</span>
          </span>
        </Link>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={
                (n.href === "/" ? path === "/" : path.startsWith(n.href)) ? "page" : undefined
              }
            >
              {n.label}
            </Link>
          ))}
          <Link href="/pairings">Player view</Link>
        </nav>
        <div className="side-foot">
          <ThemeToggle />
          <span>By Syntaxure Labs</span>
        </div>
      </aside>
      <main className="main">
        <div className="demo-bar" role="note">
          Demo mode: sample players and placeholder tee ratings. Nothing is saved yet, and a page
          refresh resets everything.
        </div>
        {children}
      </main>
    </div>
  );
}
