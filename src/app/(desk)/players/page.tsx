"use client";

import {
  ChevronRight,
  ClipboardList,
  Power,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Avatar, StatusPill } from "@/components/bits";
import { RoleGate } from "@/components/desk";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader } from "@/components/PageHeader";
import { Pager } from "@/components/paging/Pager";
import { sortStable, usePagedList } from "@/components/paging/usePagedList";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tip } from "@/components/ui/tooltip";
import {
  countPairings,
  matchesPairing,
  PAIRING_FILTERS,
  type PairingStatus,
  pairingStatusFromQuery,
} from "@/lib/data/pairing-status";
import { isPlayerRemoved, playerStateLabel } from "@/lib/data/player-state";
import { fmtHcp, fmtIndex, photoOf } from "@/lib/format";
import { matchesText } from "@/lib/names";
import { shrinkPhoto } from "@/lib/photo";
import { useDesk } from "@/lib/store/desk-store";
import { cn } from "@/lib/ui/cn";

/** The playing states, which are what the directory filters by. */
type StatusFilter = "ok" | "needs_review" | "ineligible" | "not_entered";
type Filter = "all" | "removed" | StatusFilter;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ok", label: "Ready" },
  { id: "needs_review", label: "Needs review" },
  { id: "ineligible", label: "Not eligible" },
  { id: "not_entered", label: "Not entered" },
  // Disabled and soft-deleted records. They are left out of every other filter.
  { id: "removed", label: "Removed" },
];

export default function PlayersPage() {
  return (
    <Suspense>
      <Players />
    </Suspense>
  );
}

function statusOf(entry: boolean, status: string | undefined): StatusFilter {
  if (!entry) return "not_entered";
  return (status as StatusFilter | undefined) ?? "needs_review";
}

/**
 * The empty state has to say why the list is empty. A pairing view that hides nothing and a search
 * that matches nothing need different advice.
 */
function emptyRosterMessage(pairing: PairingStatus, query: string, beforePairing: number): string {
  if (pairing !== "all" && beforePairing > 0) {
    return pairing === "paired"
      ? "No paired players found on this list. Choose Unpaired or All players."
      : "No unpaired players found on this list. Choose Paired or All players.";
  }
  if (query.trim() !== "") {
    return "No players match the search. Clear the search to see the whole list.";
  }
  return "No players match these filters. Clear a filter, or choose All players.";
}

function Players() {
  const {
    tournament,
    players,
    registrations,
    regById,
    entryByPlayer,
    names,
    adapters,
    pendingRefreeze,
    member,
  } = useDesk();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [gender, setGender] = useState("all");
  const [home, setHome] = useState("all");
  // The top bar's search lands here as ?q=.
  const searchParams = useSearchParams();
  const q = searchParams.get("q");
  useEffect(() => {
    if (q !== null) setQuery(q);
  }, [q]);
  // The pairing view is shareable through ?pairing_status=paired|unpaired. Missing means All.
  const pairingParam = searchParams.get("pairing_status");
  const [pairing, setPairing] = useState<PairingStatus>(() => pairingStatusFromQuery(pairingParam));
  useEffect(() => {
    // Setting the same primitive is a no-op, so the popstate listener below cannot cause a loop.
    setPairing((current) => {
      const next = pairingStatusFromQuery(pairingParam);
      return current === next ? current : next;
    });
  }, [pairingParam]);
  // Back and Forward change window.location without re-running the searchParams effect above.
  useEffect(() => {
    function onPopState() {
      setPairing((current) => {
        const next = pairingStatusFromQuery(
          new URLSearchParams(window.location.search).get("pairing_status"),
        );
        return current === next ? current : next;
      });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const [open, setOpen] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [genderValue, setGenderValue] = useState<"M" | "F">("M");
  const [homeCourse, setHomeCourse] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");
  const [ngapId, setNgapId] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [consent, setConsent] = useState(false);
  const [publicConsent, setPublicConsent] = useState(false);
  const [photoError, setPhotoError] = useState("");
  /** Why the directory write was refused. The sheet stays open with every value still in it. */
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  /** The row whose state change is in flight, so its buttons cannot be pressed twice. */
  const [removingId, setRemovingId] = useState<string | null>(null);

  const homeCourses = useMemo(
    () => [...new Set(players.map((p) => p.homeCourse).filter((c): c is string => !!c))].sort(),
    [players],
  );
  const categories = tournament?.categories ?? [];
  const canSave = firstName.trim() !== "" && lastName.trim() !== "" && (!photo || consent);

  // Everything except the pairing view, so its badges can say what each view will reveal.
  const baseRows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return players.filter((p) => {
      const reg = regById.get(p.id);
      const entered = entryByPlayer.has(p.id);
      const status = statusOf(entered, reg?.status);
      // A retired record appears only under Removed; every other filter is about playing.
      if (isPlayerRemoved(p) !== (filter === "removed")) return false;
      if (filter !== "all" && filter !== "removed" && status !== filter) return false;
      if (gender !== "all" && p.gender !== gender) return false;
      if (home !== "all" && p.homeCourse !== home) return false;
      if (category !== "all" && reg?.categoryId !== category) return false;
      if (!text) return true;
      return matchesText([p.name, p.nickname, p.ngapId, p.homeCourse], text);
    });
  }, [players, regById, entryByPlayer, filter, query, gender, home, category]);

  const pairingCounts = useMemo(
    () => countPairings(baseRows.map((p) => entryByPlayer.get(p.id) ?? null)),
    [baseRows, entryByPlayer],
  );

  const rows = useMemo(
    () => baseRows.filter((p) => matchesPairing(entryByPlayer.get(p.id), pairing)),
    [baseRows, entryByPlayer, pairing],
  );

  // Filter first, then page. The order is stable so editing a row cannot move it to another page,
  // and any change to the search or filter sends the desk back to page 1.
  const ordered = useMemo(() => sortStable(rows, (a, b) => a.name.localeCompare(b.name)), [rows]);
  const { page, setPage } = usePagedList(
    ordered,
    [query, filter, gender, home, category, pairing].join("|"),
  );

  const emptyMessage = emptyRosterMessage(pairing, query, baseRows.length);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: 0,
      ok: 0,
      needs_review: 0,
      ineligible: 0,
      not_entered: 0,
      removed: 0,
    };
    for (const p of players) {
      if (isPlayerRemoved(p)) {
        c.removed++;
        continue;
      }
      const reg = regById.get(p.id);
      c.all++;
      c[statusOf(entryByPlayer.has(p.id), reg?.status)]++;
    }
    return c;
  }, [players, regById, entryByPlayer]);

  /**
   * Changes the pairing view and writes it into the address bar. The native history call keeps the
   * update client-side: reload and bookmark still see the filter, but nothing is fetched again.
   */
  function choosePairing(next: PairingStatus) {
    setPairing(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "all") params.delete("pairing_status");
    else params.set("pairing_status", next);
    const search = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
    );
  }

  /**
   * Runs one state change and holds that row's buttons while it is in flight. The connected adapter
   * resolves after the database has decided, so a refused change leaves the row as it was and the
   * desk's error bar carries the database message.
   */
  async function runState(id: string, run: () => Promise<void>) {
    setRemovingId(id);
    try {
      await run();
    } catch {
      // The desk's error bar shows the reason.
    } finally {
      setRemovingId(null);
    }
  }

  function reset() {
    setFirstName("");
    setLastName("");
    setNickname("");
    setBirthdate("");
    setGenderValue("M");
    setHomeCourse("");
    setContactNumber("");
    setEmail("");
    setNgapId("");
    setPhoto(undefined);
    setConsent(false);
    setPublicConsent(false);
    setPhotoError("");
    setSaveError("");
    setSaving(false);
  }

  function onOpenChange(o: boolean) {
    setOpen(o);
    if (!o) reset();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const created = adapters.players.add({
        firstName,
        lastName,
        nickname,
        birthdate: birthdate || null,
        gender: genderValue,
        homeCourse,
        contactNumber,
        email,
        ngapId,
        photo,
        photoConsent: photo ? consent : undefined,
        photoPublicConsent: photo && consent ? publicConsent : undefined,
      });
      // The connected adapter attaches its database write; wait for it before saying "added".
      await created.saved;
      onOpenChange(false);
    } catch (error) {
      // Nothing else changes: the sheet stays open and every field keeps its value for a retry.
      setSaveError(
        error instanceof Error
          ? error.message
          : "The player was not added. The values are still here; try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!tournament) return <NeedsTournament what="The player directory" />;

  return (
    <div className="grid gap-6">
      <PageHeader
        overline="Club directory"
        title="Players"
        crumbs={[{ label: tournament.name, href: "/tournaments" }, { label: "Players" }]}
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <UserPlus aria-hidden="true" />
            Add player
          </Button>
        }
      >
        {players.length} players on file · {registrations.length} entered in {tournament.name}.
        Category, tee and flight come from the frozen NGAP index.
      </PageHeader>

      {pendingRefreeze.length > 0 && (
        <div className="notice warn flex items-start gap-2.5" role="status">
          <p className="text-[14px]">
            <b>{pendingRefreeze.length} registrations</b> have a newer imported index than the one
            frozen on them. Re-freeze before the draw:{" "}
            <Link href="/register">open the registration desk</Link>.
          </p>
        </div>
      )}

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-[1_1_16rem]">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              className="!pl-9"
              data-help="players-search"
              placeholder="Search name, nickname, NGAP ID or home course"
              aria-label="Search players"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filter by status"
            data-help="players-filters"
          >
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                  filter === f.id
                    ? "border-fairway bg-fairway-soft font-semibold text-ink"
                    : "border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken",
                )}
              >
                {f.label}
                <span className="text-xs text-ink-muted tnum">{counts[f.id]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="overline" id="pairing-filter-label">
            Pairing
          </span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="pairing-filter-label">
            {PAIRING_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={pairing === f.id}
                onClick={() => choosePairing(f.id)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                  pairing === f.id
                    ? "border-fairway bg-fairway-soft font-semibold text-ink"
                    : "border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken",
                )}
                title={
                  f.id === "unpaired"
                    ? "No partner number on the active event's registration. A player not entered in the event cannot be paired and counts here."
                    : undefined
                }
              >
                {f.label}
                <span className="text-xs text-ink-muted tnum">{pairingCounts[f.id]}</span>
              </button>
            ))}
          </div>
          <span className="hint">
            Partner number from the active event. Not entered counts as unpaired.
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 xl:max-w-[52rem]">
          <label className="field">
            <span>Gender / category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">Every category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Gender</span>
            <select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="all">Any</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </label>
          <label className="field">
            <span>Home course</span>
            <select value={home} onChange={(e) => setHome(e.target.value)}>
              <option value="all">Any</option>
              {homeCourses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Wide screens: the full table. */}
      <div className="table-wrap hidden md:block">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Role</th>
              <th>Category</th>
              <th className="num">Age</th>
              <th className="num">Index at cut-off</th>
              <th className="num">Course handicap</th>
              <th>Flight</th>
              <th>Status</th>
              <th>
                <span className="sr">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((p) => {
              const r = regById.get(p.id);
              const entered = entryByPlayer.has(p.id);
              // The club's own classification, not the entry's: a registration can be created
              // without a role, and the member directory is what the desk checks.
              const role = p.membershipType ?? r?.role ?? null;
              const latest = adapters.players.latestRecord(p.id);
              return (
                <tr key={p.id}>
                  <td>
                    <Link
                      href={`/players/${p.id}`}
                      data-help="players-open"
                      className="flex min-w-0 items-center gap-2.5 font-semibold text-ink no-underline hover:underline"
                    >
                      <Avatar name={p.name} photo={photoOf(p)} />
                      <span className="min-w-0">
                        <span className="block truncate">{p.name}</span>
                        <span className="hint">
                          {p.ngapId ? `NGAP ${p.ngapId}` : "No NGAP ID"}
                          {p.homeCourse ? ` · ${p.homeCourse}` : ""}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    {role === "guest" ? (
                      <span className="pill info">Guest</span>
                    ) : role === "member" ? (
                      <span className="pill">Member</span>
                    ) : (
                      <span className="pill">—</span>
                    )}
                  </td>
                  <td>{names.category(r?.categoryId ?? null)}</td>
                  <td className="num mono">{r?.ageKnown ? r.age : p.birthdate ? "…" : "—"}</td>
                  <td className="num mono">
                    {r ? (
                      <>
                        {fmtIndex(r.frozenIndex)}
                        {latest && r.frozenRecordId !== latest.id && (
                          <span className="hint block">
                            latest {fmtIndex(latest.index)} ({latest.effectiveDate})
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num mono">{fmtHcp(r?.playingHandicap ?? null)}</td>
                  <td>{names.flight(r?.flightId ?? null)}</td>
                  <td>
                    {isPlayerRemoved(p) && (
                      <span className="pill warn mb-1">{playerStateLabel(p)}</span>
                    )}
                    {r ? (
                      <>
                        <span className="flex flex-wrap gap-1">
                          <StatusPill status={r.status} />
                          {r.frozenOutdated && <span className="pill warn">Re-freeze</span>}
                          {r.staleIndex && <span className="pill warn">Old index</span>}
                        </span>
                        {r.reasons.length > 0 && (
                          <div className="hint mt-1 max-w-[18rem]">{r.reasons[0]}</div>
                        )}
                      </>
                    ) : (
                      <span className="pill">Not entered</span>
                    )}
                  </td>
                  <td>
                    <span className="flex items-center justify-end gap-1">
                      {!entered && (
                        <Button variant="secondary" size="sm" asChild>
                          <Link href={`/register?player=${p.id}`}>
                            <ClipboardList aria-hidden="true" />
                            Register
                          </Link>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/players/${p.id}`}>
                          Profile
                          <ChevronRight aria-hidden="true" />
                        </Link>
                      </Button>
                      <RoleGate role={member?.role} allow={["owner", "organizer"]} mode="hide">
                        {isPlayerRemoved(p) ? (
                          <Tip label="Put back in the club directory" side="left">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={
                                removingId === p.id ? `Restoring ${p.name}` : `Restore ${p.name}`
                              }
                              className="text-ink-muted hover:text-ink"
                              disabled={removingId === p.id}
                              onClick={() => runState(p.id, () => adapters.players.restore(p.id))}
                            >
                              <RotateCcw aria-hidden="true" />
                            </Button>
                          </Tip>
                        ) : (
                          <>
                            <Tip
                              label={
                                p.active === false ? "Enable this player" : "Disable this player"
                              }
                              side="left"
                            >
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={
                                  p.active === false ? `Enable ${p.name}` : `Disable ${p.name}`
                                }
                                className="text-ink-muted hover:text-ink"
                                disabled={removingId === p.id}
                                onClick={() =>
                                  runState(p.id, () =>
                                    adapters.players.setActive(p.id, p.active === false),
                                  )
                                }
                              >
                                <Power aria-hidden="true" />
                              </Button>
                            </Tip>
                            <Tip label="Remove from the club directory" side="left">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={
                                  removingId === p.id ? `Removing ${p.name}` : `Remove ${p.name}`
                                }
                                className="text-ink-muted hover:text-danger"
                                disabled={removingId === p.id}
                                onClick={() => {
                                  const confirmed = window.confirm(
                                    [
                                      `Remove ${p.name} from the club directory?`,
                                      "",
                                      "This hides the record, so it stops appearing in the directory and is never drawn. The handicap history and the registrations are kept, and Restore brings the player back.",
                                    ].join("\n"),
                                  );
                                  if (!confirmed) return;
                                  // The adapter resolves after the database has decided, so a
                                  // refused change leaves the row where it is.
                                  runState(p.id, () => adapters.players.softDelete(p.id));
                                }}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            </Tip>
                          </>
                        )}
                      </RoleGate>
                    </span>
                  </td>
                </tr>
              );
            })}
            {page.total === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Phones: one card per player. */}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 md:hidden" aria-label="Players">
        {page.items.map((p) => {
          const r = regById.get(p.id);
          const entered = entryByPlayer.has(p.id);
          const role = p.membershipType ?? r?.role ?? null;
          return (
            <li key={p.id} className="card grid min-w-0 gap-3 !p-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={p.name} photo={photoOf(p)} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/players/${p.id}`}
                    data-help="players-open"
                    className="block truncate font-semibold text-ink no-underline hover:underline"
                  >
                    {p.name}
                  </Link>
                  <span className="hint">
                    {names.category(r?.categoryId ?? null)}
                    {r?.ageKnown ? ` · age ${r.age}` : ""}
                    {role === "guest" ? " · guest" : ""}
                  </span>
                </div>
                {isPlayerRemoved(p) && <span className="pill warn">{playerStateLabel(p)}</span>}
                {r ? <StatusPill status={r.status} /> : <span className="pill">Not entered</span>}
              </div>
              <dl className="grid grid-cols-3 gap-2 rounded-[10px] bg-surface-sunken px-3 py-2">
                <div className="min-w-0">
                  <dt className="overline !text-[10px]">Index</dt>
                  <dd className="m-0 font-display font-bold tnum">
                    {fmtIndex(r?.frozenIndex ?? null)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="overline !text-[10px]">Playing</dt>
                  <dd className="m-0 font-display font-bold tnum">
                    {fmtHcp(r?.playingHandicap ?? null)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="overline !text-[10px]">Flight</dt>
                  <dd className="m-0 truncate font-display font-bold">
                    {names.flight(r?.flightId ?? null)}
                  </dd>
                </div>
              </dl>
              {r && r.reasons.length > 0 && <p className="hint min-w-0">{r.reasons[0]}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="hint min-w-0">{p.homeCourse ?? "Home course not set"}</span>
                <span className="flex shrink-0 flex-wrap gap-1">
                  {!entered && (
                    <Button variant="secondary" size="sm" asChild>
                      <Link href={`/register?player=${p.id}`}>Register</Link>
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" asChild>
                    <Link href={`/players/${p.id}`}>
                      Profile
                      <ChevronRight aria-hidden="true" />
                    </Link>
                  </Button>
                  <RoleGate role={member?.role} allow={["owner", "organizer"]} mode="hide">
                    {isPlayerRemoved(p) ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={removingId === p.id}
                        onClick={() => runState(p.id, () => adapters.players.restore(p.id))}
                      >
                        Restore
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={removingId === p.id}
                          onClick={() =>
                            runState(p.id, () =>
                              adapters.players.setActive(p.id, p.active === false),
                            )
                          }
                        >
                          {p.active === false ? "Enable" : "Disable"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={removingId === p.id}
                          onClick={() => {
                            const confirmed = window.confirm(
                              [
                                `Remove ${p.name} from the club directory?`,
                                "",
                                "This hides the record, so it stops appearing in the directory and is never drawn. The handicap history and the registrations are kept, and Restore brings the player back.",
                              ].join("\n"),
                            );
                            if (!confirmed) return;
                            runState(p.id, () => adapters.players.softDelete(p.id));
                          }}
                        >
                          Remove
                        </Button>
                      </>
                    )}
                  </RoleGate>
                </span>
              </div>
            </li>
          );
        })}
        {page.total === 0 && <li className="card muted">{emptyMessage}</li>}
      </ul>

      <Pager page={page} onPage={setPage} />

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          title="Add player"
          description="Creates a club directory record. The NGAP index arrives with the import; nothing is guessed."
          className="w-[min(520px,calc(100vw-24px))] sm:p-5"
        >
          <form className="grid gap-5" onSubmit={save}>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="field">
                <span>First name (required)</span>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span>Last name (required)</span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span>Nickname (optional)</span>
                <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} />
              </label>
              <label className="field">
                <span>Gender (required)</span>
                <select
                  value={genderValue}
                  onChange={(e) => setGenderValue(e.target.value as "M" | "F")}
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </label>
              <label className="field">
                <span>Birthdate (required)</span>
                <input
                  type="date"
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>NGAP ID (optional)</span>
                <input
                  type="text"
                  value={ngapId}
                  onChange={(e) => setNgapId(e.target.value)}
                  inputMode="numeric"
                />
              </label>
              <label className="field">
                <span>Home course</span>
                <input
                  type="text"
                  value={homeCourse}
                  onChange={(e) => setHomeCourse(e.target.value)}
                  placeholder="Iloilo Golf & Country Club"
                />
              </label>
              <label className="field">
                <span>Contact number</span>
                <input
                  type="tel"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                />
              </label>
              <label className="field sm:col-span-2">
                <span>Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
            </div>

            <div className="grid gap-2.5 rounded-[14px] border border-dashed border-line-strong p-3.5">
              <p className="overline">Player photo</p>
              <label className="field">
                <span>Photo (optional)</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="text-[13px] text-ink-muted"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    setPhotoError("");
                    setConsent(false);
                    setPublicConsent(false);
                    if (!f) return setPhoto(undefined);
                    try {
                      setPhoto(await shrinkPhoto(f));
                    } catch (err) {
                      setPhotoError((err as Error).message);
                    }
                  }}
                />
              </label>
              {photoError && (
                <p className="hint !text-danger" role="alert">
                  {photoError}
                </p>
              )}
              {photo ? (
                <>
                  <img
                    src={photo}
                    alt="Preview of the photo to be saved"
                    className="size-24 rounded-[10px] border border-line object-cover"
                  />
                  <label className="check text-[13px]">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => {
                        setConsent(e.target.checked);
                        if (!e.target.checked) setPublicConsent(false);
                      }}
                    />
                    <span>
                      The player agrees to have their photo kept on file and used for check-in,
                      their player profile and tournament posters.
                    </span>
                  </label>
                  <label className="check text-[13px]">
                    <input
                      type="checkbox"
                      checked={publicConsent}
                      disabled={!consent}
                      onChange={(e) => setPublicConsent(e.target.checked)}
                    />
                    <span>
                      Separately, the player agrees this photo may appear on public pairings, the
                      public leaderboard and printed start sheets. Optional.
                    </span>
                  </label>
                </>
              ) : (
                <div className="grid h-24 w-24 place-items-center rounded-[10px] border border-dashed border-line-strong bg-surface-sunken text-center text-[11px] text-ink-muted">
                  No photo
                </div>
              )}
            </div>

            <div className="preview" aria-live="polite">
              <p className="overline mb-1">Where they land</p>
              <p className="text-[14px]">
                Category, tee and flight need a handicap index. This record has none yet, so it will
                show as <b>Needs review</b> until the NGAP import brings one on or before{" "}
                {tournament.cutOffDate}. Nothing is invented.
              </p>
            </div>

            {saveError && (
              <p className="hint !text-danger" role="alert">
                {saveError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!canSave || saving}>
                {saving ? "Saving…" : saveError ? "Try save again" : "Add to the directory"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
