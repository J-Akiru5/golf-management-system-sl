"use client";

import { ChevronRight, Search, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Avatar, StatusPill } from "@/components/bits";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tip } from "@/components/ui/tooltip";
import type { DeskPlayer } from "@/lib/demo/data";
import { fmtHcp, fmtIndex, photoOf } from "@/lib/format";
import { parseIndex } from "@/lib/ngap";
import { shrinkPhoto } from "@/lib/photo";
import type { RegistrationStatus } from "@/lib/routing";
import { useDesk } from "@/lib/store/desk-store";
import { cn } from "@/lib/ui/cn";

type Filter = "all" | RegistrationStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ok", label: "Ready" },
  { id: "needs_review", label: "Needs review" },
  { id: "ineligible", label: "Not eligible" },
];

export default function PlayersPage() {
  return (
    <Suspense>
      <Players />
    </Suspense>
  );
}

function Players() {
  const { state, registrations, regById, names, dispatch, classify } = useDesk();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  // The top bar's search lands here as ?q=.
  const q = useSearchParams().get("q");
  useEffect(() => {
    if (q !== null) setQuery(q);
  }, [q]);
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [ngapId, setNgapId] = useState("");
  const [indexText, setIndexText] = useState("");
  const [shirt, setShirt] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [consent, setConsent] = useState(false);
  const [photoError, setPhotoError] = useState("");

  const idx = parseIndex(indexText);
  const draft: DeskPlayer | null =
    name.trim() && birthdate && idx.ok
      ? {
          id: "draft",
          name: name.trim(),
          birthdate,
          gender,
          index: idx.value,
          ngapId: ngapId.trim() || null,
        }
      : null;
  const preview = draft ? classify(draft) : null;
  const canSave = Boolean(draft) && (!photo || consent);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.players.filter((p) => {
      const r = regById.get(p.id);
      return (filter === "all" || r?.status === filter) && (!q || p.name.toLowerCase().includes(q));
    });
  }, [state.players, regById, filter, query]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, ok: 0, needs_review: 0, ineligible: 0 };
    for (const r of registrations) {
      c.all++;
      c[r.status]++;
    }
    return c;
  }, [registrations]);

  function reset() {
    setName("");
    setBirthdate("");
    setGender("M");
    setNgapId("");
    setIndexText("");
    setShirt("");
    setPhoto(undefined);
    setConsent(false);
    setPhotoError("");
  }

  function onOpenChange(o: boolean) {
    setOpen(o);
    if (!o) reset();
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !canSave) return;
    dispatch({
      type: "addPlayer",
      player: {
        ...draft,
        id: `p${Date.now()}`,
        shirt: shirt || undefined,
        photo,
        photoConsent: photo ? true : undefined,
      },
    });
    onOpenChange(false);
  }

  const remove = (id: string) => dispatch({ type: "removePlayer", id });

  return (
    <div className="grid gap-6">
      <PageHeader
        overline="Field & entries"
        title="Players"
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <UserPlus aria-hidden="true" />
            Add player
          </Button>
        }
      >
        {registrations.length} added. Category, tee and flight are worked out automatically.
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-[1_1_16rem]">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            className="!pl-9"
            placeholder="Search by name"
            aria-label="Search players by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
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

      {/* Wide screens: the full table. */}
      <div className="table-wrap hidden md:block">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Category</th>
              <th className="num">Age</th>
              <th className="num">Index</th>
              <th>Tee</th>
              <th className="num">Playing HCP</th>
              <th>Flight</th>
              <th>Status</th>
              <th>
                <span className="sr">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const r = regById.get(p.id);
              if (!r) return null;
              return (
                <tr key={p.id}>
                  <td>
                    <Link
                      href={`/players/${p.id}`}
                      className="flex min-w-0 items-center gap-2.5 font-semibold text-ink no-underline hover:underline"
                    >
                      <Avatar name={p.name} photo={photoOf(p)} />
                      <span className="truncate">{p.name}</span>
                    </Link>
                  </td>
                  <td>{names.category(r.categoryId)}</td>
                  <td className="num mono">{r.age}</td>
                  <td className="num mono">{fmtIndex(p.index)}</td>
                  <td>{names.tee(r.teeId)}</td>
                  <td className="num mono">{fmtHcp(r.playingHandicap)}</td>
                  <td>{names.flight(r.flightId)}</td>
                  <td>
                    <StatusPill status={r.status} />
                    {r.reasons.length > 0 && (
                      <div className="hint mt-1 max-w-[16rem]">{r.reasons[0]}</div>
                    )}
                  </td>
                  <td>
                    <span className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/players/${p.id}`}>
                          Profile
                          <ChevronRight aria-hidden="true" />
                        </Link>
                      </Button>
                      <Tip label="Remove from tournament" side="left">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${p.name}`}
                          className="text-ink-muted hover:text-danger"
                          onClick={() => remove(p.id)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </Tip>
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  No players match. Clear the search or choose All.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Phones: one card per player. */}
      <ul className="grid gap-2.5 md:hidden" aria-label="Players">
        {rows.map((p) => {
          const r = regById.get(p.id);
          if (!r) return null;
          return (
            <li key={p.id} className="card grid gap-3 !p-3.5">
              <div className="flex items-center gap-3">
                <Avatar name={p.name} photo={photoOf(p)} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/players/${p.id}`}
                    className="block truncate font-semibold text-ink no-underline hover:underline"
                  >
                    {p.name}
                  </Link>
                  <span className="hint">
                    {names.category(r.categoryId)} · age {r.age}
                  </span>
                </div>
                <StatusPill status={r.status} />
              </div>
              <dl className="grid grid-cols-3 gap-2 rounded-[10px] bg-surface-sunken px-3 py-2">
                <div>
                  <dt className="overline !text-[10px]">Index</dt>
                  <dd className="m-0 font-display font-bold tnum">{fmtIndex(p.index)}</dd>
                </div>
                <div>
                  <dt className="overline !text-[10px]">Playing</dt>
                  <dd className="m-0 font-display font-bold tnum">{fmtHcp(r.playingHandicap)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="overline !text-[10px]">Flight</dt>
                  <dd className="m-0 truncate font-display font-bold">
                    {names.flight(r.flightId)}
                  </dd>
                </div>
              </dl>
              {r.reasons.length > 0 && <p className="hint">{r.reasons[0]}</p>}
              <div className="flex items-center justify-between gap-2">
                <span className="hint">{names.tee(r.teeId)} tee</span>
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${p.name}`}
                    className="text-ink-muted hover:text-danger"
                    onClick={() => remove(p.id)}
                  >
                    <Trash2 aria-hidden="true" />
                    Remove
                  </Button>
                  <Button variant="secondary" size="sm" asChild>
                    <Link href={`/players/${p.id}`}>
                      Profile
                      <ChevronRight aria-hidden="true" />
                    </Link>
                  </Button>
                </span>
              </div>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="card muted">No players match. Clear the search or choose All.</li>
        )}
      </ul>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          title="Add player"
          description="Category, tee and flight are worked out from these details."
          className="w-[min(480px,calc(100vw-24px))] sm:p-5"
        >
          <form className="grid gap-5" onSubmit={save}>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="field sm:col-span-2">
                <span>Full name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span>Birthdate</span>
                <input
                  type="date"
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Gender</span>
                <select value={gender} onChange={(e) => setGender(e.target.value as "M" | "F")}>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </label>
              <label className="field">
                <span>Handicap index</span>
                <input
                  type="text"
                  value={indexText}
                  onChange={(e) => setIndexText(e.target.value)}
                  inputMode="decimal"
                  placeholder="14.2, +2.3 or NH"
                />
                {!idx.ok && indexText && (
                  <span className="hint !text-danger" role="alert">
                    {idx.message}
                  </span>
                )}
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
                <span>T-shirt size (optional)</span>
                <select value={shirt} onChange={(e) => setShirt(e.target.value)}>
                  <option value="">—</option>
                  {["S", "M", "L", "XL", "XXL"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-2.5 rounded-[14px] border border-dashed border-line-strong p-3.5">
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
              {photo && (
                <label className="check text-[13px]">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    The player agrees to have their photo kept on file and used for check-in, their
                    player profile and tournament posters.
                  </span>
                </label>
              )}
            </div>

            <div className="preview" aria-live="polite">
              <p className="overline mb-1">Where they land</p>
              {preview ? (
                preview.status === "ok" ? (
                  <p>
                    Will play <b>{names.category(preview.categoryId)}</b> from the{" "}
                    <b>{names.tee(preview.teeId)}</b> tee, playing handicap{" "}
                    <b>{fmtHcp(preview.playingHandicap)}</b>,{" "}
                    <b>{names.flight(preview.flightId)}</b>.
                  </p>
                ) : (
                  <div className="grid justify-items-start gap-1.5">
                    <StatusPill status={preview.status} />
                    <b>{preview.reasons.join(" ")}</b>
                  </div>
                )
              ) : (
                <p>Fill in name, birthdate and index to see where this player lands.</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!canSave}>
                Add to tournament
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
