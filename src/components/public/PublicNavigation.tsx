"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const primaryLinks = [
  { href: "/events", label: "Events" },
  { href: "/pairings", label: "Player pairings" },
  { href: "/results/all", label: "Results" },
  { href: "/faq", label: "NGAP FAQ" },
  { href: "/feedback", label: "Feedback" },
] as const;

export function PublicNavigation() {
  const pathname = usePathname();

  return (
    <nav className="tl-pub-nav-links" aria-label="Main navigation">
      {primaryLinks.map(({ href, label }) => {
        const current =
          pathname === href || (href === "/results/all" && pathname?.startsWith("/results"));
        return (
          <Link key={href} href={href} aria-current={current ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
