import Link from "next/link";
import { cn } from "@/lib/ui/cn";

const TABS = [
  { href: "/admin", label: "Accounts" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

export type AdminTab = "accounts" | "audit";

/**
 * The two Admin pages. Links, not a client tab panel, so the audit log is a real address that can
 * be bookmarked and reloaded.
 */
export function AdminTabs({ active }: { active: AdminTab }) {
  return (
    <nav
      aria-label="Admin"
      className="inline-flex items-center gap-0.5 self-start rounded-md bg-surface-sunken p-1 text-ink-muted"
    >
      {TABS.map((tab) => {
        const isActive =
          (tab.href === "/admin" && active === "accounts") ||
          (tab.href === "/admin/audit" && active === "audit");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center justify-center rounded-sm px-4 text-[13px] font-medium transition-colors hover:text-ink",
              isActive && "bg-surface-raised font-semibold text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
