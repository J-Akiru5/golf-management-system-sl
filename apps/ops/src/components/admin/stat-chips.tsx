import type { AccountStats } from "@/lib/admin/types";

const CHIPS: ReadonlyArray<{ key: keyof AccountStats; label: string }> = [
  { key: "total", label: "Accounts" },
  { key: "activeStaff", label: "Active staff" },
  { key: "suspended", label: "Suspended" },
  { key: "invited", label: "Invited" },
  { key: "inactive", label: "Inactive 30+ days" },
];

/** The five counts at the top of Admin. Plain numbers, no sparklines and no invented trend. */
export function StatChips({ stats }: { stats: AccountStats }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {CHIPS.map((chip) => (
        <li key={chip.key} className="rounded-lg border border-line bg-surface-raised px-3 py-2.5">
          <p className="overline">{chip.label}</p>
          <p className="tnum mt-1 font-display text-2xl font-bold leading-none text-ink">
            {stats[chip.key]}
          </p>
        </li>
      ))}
    </ul>
  );
}
