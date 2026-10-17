"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, StatusPill } from "@/components/bits";
import type { DeskPlayer } from "@/lib/demo/data";
import { fmtHcp, fmtIndex, photoOf } from "@/lib/format";
import { parseIndex } from "@/lib/ngap";
import { shrinkPhoto } from "@/lib/photo";
import type { RegistrationStatus } from "@/lib/routing";
import { useDesk } from "@/lib/store/desk-store";

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
  const dialog = useRef<HTMLDialogElement>(null);

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
    dialog.current?.close();
    reset();
  }

  return (
    <div className="stack">
      <header className="row between">
        <div>
          <h1>Players</h1>
          <p className="muted">
            {registrations.length} added. Category, tee and flight are worked out automatically.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => dialog.current?.showModal()}>
          Add player
        </button>
      </header>

      <div className="row">
        <input
          type="search"
          className="grow"
          placeholder="Search by name"
          aria-label="Search players by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="chip"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
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
                    <span className="who">
                      <Avatar name={p.name} photo={photoOf(p)} />
                      <span>{p.name}</span>
                    </span>
                  </td>
                  <td>{names.category(r.categoryId)}</td>
                  <td className="num mono">{r.age}</td>
                  <td className="num mono">{fmtIndex(p.index)}</td>
                  <td>{names.tee(r.teeId)}</td>
                  <td className="num mono">{fmtHcp(r.playingHandicap)}</td>
                  <td>{names.flight(r.flightId)}</td>
                  <td>
                    <StatusPill status={r.status} />
                    {r.reasons.length > 0 && <div className="hint">{r.reasons[0]}</div>}
                  </td>
                  <td>
                    <span className="row">
                      <Link className="btn small ghost" href={`/players/${p.id}`}>
                        Profile
                      </Link>
                      <button
                        type="button"
                        className="btn small ghost"
                        onClick={() => dispatch({ type: "removePlayer", id: p.id })}
                      >
                        Remove
                      </button>
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

      <dialog ref={dialog} aria-labelledby="add-title" onClose={reset}>
        <form className="dialog-body" onSubmit={save}>
          <h2 id="add-title">Add player</h2>
          <div className="form-grid">
            <label className="field">
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
              <span>NGAP ID (optional)</span>
              <input
                type="text"
                value={ngapId}
                onChange={(e) => setNgapId(e.target.value)}
                inputMode="numeric"
              />
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
                <span className="hint" role="alert">
                  {idx.message}
                </span>
              )}
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

          <div className="stack" style={{ gap: ".5rem" }}>
            <label className="field">
              <span>Photo (optional)</span>
              <input
                type="file"
                accept="image/*"
                capture="user"
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
              <p className="hint" role="alert">
                {photoError}
              </p>
            )}
            {photo && (
              <label className="check">
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
            {preview ? (
              <>
                {preview.status === "ok" ? (
                  <>
                    Will play <b>{names.category(preview.categoryId)}</b> from the{" "}
                    <b>{names.tee(preview.teeId)}</b> tee, playing handicap{" "}
                    <b>{fmtHcp(preview.playingHandicap)}</b>,{" "}
                    <b>{names.flight(preview.flightId)}</b>.
                  </>
                ) : (
                  <b>{preview.reasons.join(" ")}</b>
                )}
              </>
            ) : (
              "Fill in name, birthdate and index to see where this player lands."
            )}
          </div>

          <div className="row between">
            <button type="button" className="btn ghost" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={!canSave}>
              Add to tournament
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
