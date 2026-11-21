"use client";

import { useMemo, useState } from "react";
import { Input, Select } from "@/components/ui/field";
import { formatDateTime, relativeTime } from "@/lib/admin/format";
import type { GodAuditEntry } from "@/lib/admin/types";

const ACTIONS = [
  "all",
  "invite",
  "workspace_role",
  "desk_role",
  "tabulator_on",
  "tabulator_off",
  "suspend",
  "restore",
  "sign_out",
  "password_reset",
  "view_accounts",
  "view_clubs",
  "view_audit",
] as const;

function detailsText(details: Record<string, unknown>): string {
  const entries = Object.entries(details);
  if (entries.length === 0) return "—";
  return entries
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" · ");
}

/** The log: newest first, with an action, person and date filter. */
export function AuditLogView({
  entries,
  nowIso,
}: {
  entries: ReadonlyArray<GodAuditEntry>;
  nowIso: string;
}) {
  const [action, setAction] = useState<string>("all");
  const [person, setPerson] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hideViews, setHideViews] = useState(true);

  const filtered = useMemo(() => {
    const needle = person.trim().toLowerCase();
    const fromTime = from ? Date.parse(`${from}T00:00:00Z`) : null;
    const toTime = to ? Date.parse(`${to}T23:59:59Z`) : null;

    return entries.filter((entry) => {
      if (hideViews && entry.action.startsWith("view_")) return false;
      if (action !== "all" && entry.action !== action) return false;
      if (needle) {
        const actor = (entry.actorEmail ?? "").toLowerCase();
        const target = (entry.targetEmail ?? "").toLowerCase();
        if (!actor.includes(needle) && !target.includes(needle)) return false;
      }
      const at = Date.parse(entry.at);
      if (fromTime !== null && Number.isFinite(at) && at < fromTime) return false;
      if (toTime !== null && Number.isFinite(at) && at > toTime) return false;
      return true;
    });
  }, [entries, action, person, from, to, hideViews]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-raised p-3">
        <div className="flex min-w-44 flex-col gap-1.5">
          <label htmlFor="audit-action" className="overline">
            Action
          </label>
          <Select
            id="audit-action"
            value={action}
            onChange={(event) => setAction(event.currentTarget.value)}
          >
            {ACTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All actions" : option.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <label htmlFor="audit-person" className="overline">
            Person
          </label>
          <Input
            id="audit-person"
            value={person}
            onChange={(event) => setPerson(event.currentTarget.value)}
            placeholder="Actor or target email"
            autoComplete="off"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="audit-from" className="overline">
            From
          </label>
          <Input
            id="audit-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.currentTarget.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="audit-to" className="overline">
            To
          </label>
          <Input
            id="audit-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.currentTarget.value)}
          />
        </div>

        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-[var(--primary)]"
            checked={hideViews}
            onChange={(event) => setHideViews(event.currentTarget.checked)}
          />
          Hide page views
        </label>

        <p className="hint sm:ml-auto">
          {filtered.length} of {entries.length} entries
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface-raised">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <caption className="sr-only">Admin actions, newest first</caption>
          <thead className="border-b border-line">
            <tr className="text-left">
              <th scope="col" className="overline px-3 py-2">
                Time
              </th>
              <th scope="col" className="overline px-3 py-2">
                Actor
              </th>
              <th scope="col" className="overline px-3 py-2">
                Person
              </th>
              <th scope="col" className="overline px-3 py-2">
                Action
              </th>
              <th scope="col" className="overline px-3 py-2">
                Details
              </th>
              <th scope="col" className="overline px-3 py-2">
                Reason
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={entry.id} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2.5 align-top">
                  <span className="block text-ink">{relativeTime(entry.at, nowIso)}</span>
                  <span className="block text-[11px] text-ink-muted">
                    {formatDateTime(entry.at)}
                  </span>
                </td>
                <td className="break-all px-3 py-2.5 align-top text-ink-muted">
                  {entry.actorEmail ?? "—"}
                </td>
                <td className="break-all px-3 py-2.5 align-top text-ink-muted">
                  {entry.targetEmail ?? "—"}
                </td>
                <td className="px-3 py-2.5 align-top font-semibold text-ink">{entry.action}</td>
                <td className="px-3 py-2.5 align-top text-[12px] text-ink-muted">
                  <span className="break-all">{detailsText(entry.details)}</span>
                </td>
                <td className="px-3 py-2.5 align-top text-ink-muted">{entry.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-muted">No entries match these filters.</p>
        ) : null}
      </div>
    </div>
  );
}
