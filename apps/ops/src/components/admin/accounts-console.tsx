"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { relativeTime } from "@/lib/admin/format";
import {
  accountStatus,
  accountStatusLabel,
  accountStatusTone,
  EMPTY_FILTERS,
  filterAccounts,
  isInactive,
  paginate,
  sortAccounts,
} from "@/lib/admin/rules";
import type {
  AccountFilters,
  AccountSortKey,
  AdminActions,
  AdminClub,
  BulkAdminResult,
  GodAccount,
  GodAuditEntry,
} from "@/lib/admin/types";
import { cn } from "@/lib/ui/cn";
import { AccountSheet } from "./account-sheet";
import { BulkDialog, type BulkKind } from "./bulk-dialog";
import { InviteDialog } from "./invite-dialog";
import { ResultBanner } from "./result-banner";

const CELL = "px-3 py-2.5 align-top";
const HEAD = "px-3 py-2 text-left align-bottom";

function roleTone(role: string): "gold" | "info" | "neutral" {
  if (role === "owner") return "gold";
  if (role === "partner" || role === "organizer") return "info";
  return "neutral";
}

/**
 * The accounts view: search, filters, a sortable table, selection, the side sheet and the bulk bar.
 * All filtering and sorting is local because the whole list is already loaded; with hundreds of
 * rows that is instant and keeps every keystroke off the server.
 */
export function AccountsConsole({
  accounts,
  clubs,
  audit,
  viewerId,
  nowIso,
  canUseServiceRole,
  actions,
}: {
  accounts: GodAccount[];
  clubs: ReadonlyArray<AdminClub>;
  audit: GodAuditEntry[];
  viewerId: string;
  nowIso: string;
  canUseServiceRole: boolean;
  actions: AdminActions;
}) {
  const [filters, setFilters] = useState<AccountFilters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<AccountSortKey>("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bulkKind, setBulkKind] = useState<BulkKind | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkAdminResult | null>(null);

  const filtered = useMemo(
    () => filterAccounts(accounts, filters, nowIso),
    [accounts, filters, nowIso],
  );
  const sorted = useMemo(
    () => sortAccounts(filtered, sortKey, direction),
    [filtered, sortKey, direction],
  );
  const current = paginate(sorted, page);

  const active = accounts.find((account) => account.userId === activeId) ?? null;
  const selectedAccounts = accounts.filter((account) => selected.has(account.userId));
  const pageIds = current.items.map((account) => account.userId);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function updateFilters(next: Partial<AccountFilters>): void {
    setFilters((previous) => ({ ...previous, ...next }));
    setPage(1);
  }

  function toggleSort(key: AccountSortKey): void {
    if (key === sortKey) {
      setDirection((previous) => (previous === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDirection(key === "name" || key === "email" ? "asc" : "desc");
    }
    setPage(1);
  }

  function toggleSelected(userId: string, checked: boolean): void {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  function togglePage(checked: boolean): void {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const id of pageIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function finishBulk(result: BulkAdminResult): void {
    setBulkResult(result);
  }

  function closeBulk(): void {
    setBulkKind(null);
    if (bulkResult?.ok) setSelected(new Set());
  }

  function header(label: string, key: AccountSortKey, className?: string) {
    const activeSort = sortKey === key;
    return (
      <th
        scope="col"
        className={cn(HEAD, className)}
        aria-sort={activeSort ? (direction === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className="inline-flex min-h-8 items-center gap-1 font-semibold text-ink-muted hover:text-ink"
        >
          {label}
          {activeSort ? (
            direction === "asc" ? (
              <ArrowUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ArrowDown className="size-3.5" aria-hidden="true" />
            )
          ) : null}
        </button>
      </th>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <label htmlFor="god-search" className="overline">
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
                aria-hidden="true"
              />
              <Input
                id="god-search"
                value={filters.search}
                onChange={(event) => updateFilters({ search: event.currentTarget.value })}
                placeholder="Name or email"
                className="pl-9"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="god-filter-app" className="overline">
              App
            </label>
            <Select
              id="god-filter-app"
              value={filters.app}
              onChange={(event) =>
                updateFilters({ app: event.currentTarget.value as AccountFilters["app"] })
              }
            >
              <option value="all">All</option>
              <option value="workspace">Workspace</option>
              <option value="desk">Golf desk</option>
              <option value="tabulator">Tabulator</option>
              <option value="player">Player</option>
              <option value="none">No access</option>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="god-filter-role" className="overline">
              Role
            </label>
            <Select
              id="god-filter-role"
              value={filters.role}
              onChange={(event) =>
                updateFilters({ role: event.currentTarget.value as AccountFilters["role"] })
              }
            >
              <option value="all">All</option>
              <option value="owner">Owner</option>
              <option value="partner">Partner</option>
              <option value="member">Member</option>
              <option value="organizer">Organizer</option>
              <option value="desk">Desk</option>
              <option value="none">No role</option>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="god-filter-status" className="overline">
              Status
            </label>
            <Select
              id="god-filter-status"
              value={filters.status}
              onChange={(event) =>
                updateFilters({ status: event.currentTarget.value as AccountFilters["status"] })
              }
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="invited">Invited</option>
              <option value="unconfirmed">Unconfirmed</option>
              <option value="banned">Banned</option>
            </Select>
          </div>

          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-[var(--primary)]"
              checked={filters.inactiveOnly}
              onChange={(event) => updateFilters({ inactiveOnly: event.currentTarget.checked })}
            />
            Inactive 30+ days
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="hint">
            {sorted.length} of {accounts.length} accounts
            {filters.inactiveOnly ? " · inactive 30+ days" : ""}
          </p>
          <div className="flex items-center gap-2">
            {!canUseServiceRole ? (
              <p className="hint">Invite needs the service-role key on this project.</p>
            ) : null}
            <InviteDialog actions={actions} clubs={clubs} disabled={!canUseServiceRole} />
          </div>
        </div>
      </div>

      <ResultBanner result={bulkResult} />

      {selectedAccounts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gold bg-gold-soft p-3">
          <p className="text-sm font-semibold text-ink">{selectedAccounts.length} selected</p>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setBulkKind("role")}>
              Change workspace role
            </Button>
            <Button variant="secondary" onClick={() => setBulkKind("suspend")}>
              Suspend
            </Button>
            <Button variant="secondary" onClick={() => setBulkKind("restore")}>
              Restore
            </Button>
            <Button variant="secondary" onClick={() => setBulkKind("signout")}>
              Sign out everywhere
            </Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface-raised">
        <table className="w-full min-w-[1040px] border-collapse text-sm">
          <caption className="sr-only">Every Supabase account, its access and its activity</caption>
          <thead className="border-b border-line">
            <tr>
              <th scope="col" className={cn(HEAD, "w-10")}>
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--primary)]"
                  checked={allOnPageSelected}
                  onChange={(event) => togglePage(event.currentTarget.checked)}
                  aria-label="Select every account on this page"
                />
              </th>
              {header("Person", "name", "w-[21%]")}
              {header("Workspace", "workspace", "w-[11%]")}
              {header("Desk", "desk", "w-[17%]")}
              {header("Tabulator", "tabulator", "w-[9%]")}
              <th scope="col" className={cn(HEAD, "w-[9%]")}>
                Player
              </th>
              {header("Status", "status", "w-[10%]")}
              {header("Last sign-in", "lastSignIn", "w-[9%]")}
              {header("Last active", "lastActive", "w-[10%]")}
              <th scope="col" className={cn(HEAD, "w-10")}>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {current.items.map((account) => {
              const status = accountStatus(account);
              const inactive = isInactive(account, nowIso);
              return (
                <tr
                  key={account.userId}
                  className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-sunken"
                  onClick={() => setActiveId(account.userId)}
                >
                  <td className={CELL} onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--primary)]"
                      checked={selected.has(account.userId)}
                      onChange={(event) =>
                        toggleSelected(account.userId, event.currentTarget.checked)
                      }
                      aria-label={`Select ${account.displayName}`}
                    />
                  </td>
                  <td className={CELL}>
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar id={account.userId} name={account.displayName} size="sm" />
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveId(account.userId);
                        }}
                      >
                        <span className="block truncate font-semibold text-ink">
                          {account.displayName}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">
                          {account.email ?? "No email"}
                          {account.userId === viewerId ? " · You" : ""}
                        </span>
                      </button>
                    </div>
                  </td>
                  <td className={CELL}>
                    {account.workspaceRole ? (
                      <Badge tone={roleTone(account.workspaceRole)}>{account.workspaceRole}</Badge>
                    ) : (
                      <span className="text-ink-muted">none</span>
                    )}
                  </td>
                  <td className={CELL}>
                    {account.deskRoles.length === 0 ? (
                      <span className="text-ink-muted">none</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {account.deskRoles.map((desk) => (
                          <Badge key={desk.clubId} tone={roleTone(desk.role)}>
                            {desk.clubName}: {desk.role}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className={CELL}>
                    {account.tabulator ? (
                      <Badge tone="info">tabulator</Badge>
                    ) : (
                      <span className="text-ink-muted">none</span>
                    )}
                  </td>
                  <td className={CELL}>
                    <span className={account.playerName ? "text-ink" : "text-ink-muted"}>
                      {account.playerName ?? "none"}
                    </span>
                  </td>
                  <td className={CELL}>
                    <div className="flex flex-col items-start gap-1">
                      <Badge tone={accountStatusTone(status)}>{accountStatusLabel(status)}</Badge>
                      {inactive ? <span className="text-[11px] text-warning">inactive</span> : null}
                    </div>
                  </td>
                  <td className={CELL}>
                    <span className="text-ink-muted">
                      {relativeTime(account.lastSignInAt, nowIso)}
                    </span>
                  </td>
                  <td className={CELL}>
                    <span className={inactive ? "text-warning" : "text-ink-muted"}>
                      {relativeTime(account.lastActiveAt, nowIso)}
                    </span>
                  </td>
                  <td className={CELL}>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Open ${account.displayName}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setActiveId(account.userId);
                      }}
                    >
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {current.items.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-muted">No accounts match these filters.</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="hint">
          Page {current.page} of {current.pageCount}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={current.page <= 1}
            onClick={() => setPage(current.page - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={current.page >= current.pageCount}
            onClick={() => setPage(current.page + 1)}
          >
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <p className="hint">
        Desk access:{" "}
        {clubs.length === 0 ? "no clubs yet" : clubs.map((club) => club.name).join(", ")}
      </p>

      {active ? (
        <AccountSheet
          key={active.userId}
          account={active}
          clubs={clubs}
          audit={audit}
          nowIso={nowIso}
          viewerId={viewerId}
          canUseServiceRole={canUseServiceRole}
          actions={actions}
          onClose={() => setActiveId(null)}
        />
      ) : null}

      <BulkDialog
        key={bulkKind ?? "closed"}
        kind={bulkKind}
        accounts={selectedAccounts}
        actions={actions}
        onClose={closeBulk}
        onDone={finishBulk}
      />
    </div>
  );
}
