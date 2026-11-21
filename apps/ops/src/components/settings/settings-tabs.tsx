"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui/cn";

export type SettingsTab = { page: string; href: string; label: string };

/**
 * The Settings pages this person may open. Links, not a client tab panel, because each page is its
 * own route and should be shareable and reloadable. The page list comes from the access registry;
 * a tab they cannot open is absent, never greyed out.
 */
export function SettingsTabs({ tabs }: { tabs: ReadonlyArray<SettingsTab> }) {
  const pathname = usePathname();

  if (tabs.length === 0) return null;

  return (
    <nav
      aria-label="Settings"
      className="inline-flex items-center gap-0.5 self-start rounded-md bg-surface-sunken p-1 text-ink-muted"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center justify-center rounded-sm px-4 text-[13px] font-medium transition-colors hover:text-ink",
              active && "bg-surface-raised font-semibold text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
