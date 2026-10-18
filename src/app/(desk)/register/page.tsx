"use client";

import {
  BadgeCheck,
  CircleCheck,
  ClipboardList,
  Info,
  Landmark,
  RefreshCw,
  Search,
  TriangleAlert,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Avatar, StatusPill } from "@/components/bits";
import { type PlayerPickItem, PlayerQuickPick, SaveTruth } from "@/components/desk";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { fmtIso } from "@/lib/data/labels";
import { PAYMENT_LABEL, type PaymentStatus, type PlayerRecord } from "@/lib/data/types";
import { fmtIndex, photoOf } from "@/lib/format";
import { shrinkPhoto } from "@/lib/photo";
import { useDesk } from "@/lib/store/desk-store";
import { cn } from "@/lib/ui/cn";

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterDesk />
    </Suspense>
  );
}

interface Draft {
  player: PlayerRecord | null;
  isNew: boolean;
  firstName: string;
  lastName: string;
  nickname: string;
  gender: "M" | "F";
  birthdate: string;
  homeCourse: string;
  contactNumber: string;
  email: string;
  ngapId: string;
  photo: string | undefined;
  consent: boolean;
  role: "member" | "guest";
  sponsor: "yes" | "no" | "";
  memberShirt: string;
  guestShirt: string;
  declaredWshId: string;
  declaredWshHandicap: string;
  teePreferences: Record<string, string>;
  extra: Record<string, string>;
  paymentStatus: PaymentStatus;
}

const emptyDraft = (): Draft => ({
  player: null,
  isNew: false,
  firstName: "",
  lastName: "",
  nickname: "",
  gender: "M",
  birthdate: "",
  homeCourse: "Iloilo Golf & Country Club",
  contactNumber: "",
  email: "",
  ngapId: "",
  photo: undefined,
  consent: false,
  role: "member",
  sponsor: "",
  memberShirt: "",
  guestShirt: "",
  declaredWshId: "",
  declaredWshHandicap: "",
  teePreferences: {},
  extra: {},
  paymentStatus: "not_recorded",
});

function RegisterDesk() {
  const { tournament, players, entries, regById, adapters, dispatch, status, names } = useDesk();
  const params = useSearchParams();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [listQuery, setListQuery] = useState("");

  // ?player=id arrives from the players list ("Register").
  const prefill = params.get("player");
  useEffect(() => {
    if (!prefill) return;
    const p = players.find((x) => x.id === prefill);
    if (p) setDraft((d) => ({ ...d, player: p, isNew: false, declaredWshId: p.ngapId ?? "" }));
  }, [prefill, players]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // What the quick pick needs per player: the frozen index for this event, the routing facts when
  // the player can be classified, and whether they are already in the field.
  const pickItems = useMemo<PlayerPickItem[]>(
    () =>
      players.map((p) => {
        const reg = regById.get(p.id);
        return {
          player: p,
          index: reg?.frozenIndex ?? null,
          categoryName: reg && reg.categoryId ? names.category(reg.categoryId) : null,
          playingHandicap: reg?.playingHandicap ?? null,
          alreadyRegistered: entries.some((e) => e.playerId === p.id),
        };
      }),
    [players, regById, entries, names],
  );
  const savedReg = savedId ? regById.get(savedId) : null;
  const savedEntry = savedId ? entries.find((e) => e.playerId === savedId) : null;
  const savedPlayer = savedId ? players.find((p) => p.id === savedId) : null;

  const listRows = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    return entries
      .map((e) => ({ e, r: regById.get(e.playerId), p: players.find((p) => p.id === e.playerId) }))
      .filter(({ e, p }) => {
        if (!p) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.ngapId ?? "").toLowerCase().includes(q) ||
          e.role.includes(q)
        );
      });
  }, [entries, regById, players, listQuery]);

  if (!tournament) return <NeedsTournament what="The registration desk" />;

  const fee = tournament.registration.fields.filter(
    (f) => f.appliesTo === "both" || f.appliesTo === draft.role,
  );

  function validate(): string[] {
    const out: string[] = [];
    if (!draft.player && !draft.isNew)
      out.push("Choose a player from the directory, or start a new player.");
    if (!draft.player || draft.isNew) {
      if (!draft.firstName.trim()) out.push("First name is required.");
      if (!draft.lastName.trim()) out.push("Last name is required.");
      if (!draft.birthdate) out.push("Date of birth is required.");
      if (!draft.contactNumber.trim()) out.push("Contact number is required.");
      if (draft.photo && !draft.consent)
        out.push("Photo consent must be ticked, or remove the photo.");
    }
    if (draft.sponsor === "")
      out.push(
        `${tournament?.registration.sponsorQuestion ?? "Sponsor question"} Answer yes or no.`,
      );
    for (const f of tournament?.registration.fields ?? []) {
      if (!f.required) continue;
      if (f.appliesTo !== "both" && f.appliesTo !== draft.role) continue;
      if (f.type === "checkbox") continue;
      if (!(draft.extra[f.id] ?? "").trim()) out.push(`${f.label} is required.`);
    }
    return out;
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const problems = validate();
    setErrors(problems);
    if (problems.length > 0) return;

    let player = draft.player;
    if (!player || draft.isNew) {
      player = adapters.players.add({
        firstName: draft.firstName,
        lastName: draft.lastName,
        nickname: draft.nickname,
        birthdate: draft.birthdate || null,
        gender: draft.gender,
        homeCourse: draft.homeCourse,
        contactNumber: draft.contactNumber,
        email: draft.email,
        ngapId: draft.ngapId,
        photo: draft.photo,
        photoConsent: draft.photo ? draft.consent : undefined,
      });
    }

    // The database is unique on (event, player), so this would be rejected there. Say it plainly
    // here instead of letting the desk read a constraint error.
    if (entries.some((e) => e.playerId === player.id)) {
      setErrors([`${player.name} is already entered in this event.`]);
      return;
    }
    adapters.registrations.add(tournament?.id as string, {
      playerId: player.id,
      role: draft.role,
      sponsor: draft.sponsor === "yes",
      shirt: draft.role === "member" ? draft.memberShirt || null : draft.guestShirt || null,
      teePreferences: Object.fromEntries(
        (tournament?.registration.teeTimes ?? []).map((d) => [
          d.date,
          draft.teePreferences[d.date] || null,
        ]),
      ),
      declaredWshId: draft.declaredWshId.trim() || null,
      declaredWshHandicap: draft.declaredWshHandicap.trim() || null,
      extra: draft.extra,
      paymentStatus: draft.paymentStatus,
    });
    setSavedId(player.id);
  }

  function resetForm() {
    setDraft(emptyDraft());
    setErrors([]);
    setSavedId(null);
    setQuery("");
    setPhotoError("");
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        overline="Registration desk"
        title="Add a registration"
        crumbs={[{ label: tournament.name, href: "/tournaments" }, { label: "Registration desk" }]}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href="/players">
                <UserPlus aria-hidden="true" /> Directory
              </Link>
            </Button>
            <Button variant="ghost" onClick={resetForm}>
              Clear form
            </Button>
          </>
        }
      >
        {tournament.name} · {tournament.dates[0]} to {tournament.dates[tournament.dates.length - 1]}{" "}
        · cut-off {fmtIso(tournament.cutOffDate)}.
      </PageHeader>

      {/* Where a saved entry actually goes. Demo keeps it in the session; connected writes to the
          club database. The copy changes with the truth instead of claiming one thing always. */}
      <SaveTruth
        target={status === "demo" ? "session" : "database"}
        detail={
          status === "demo"
            ? "This build has no Supabase connection, so an entry lives in the browser session only."
            : undefined
        }
      />

      <SectionCard
        id="instructions-h"
        icon={<Info />}
        title="Event instructions"
        subtitle="Shown to the desk while taking a registration."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[12px] bg-surface-sunken p-3">
            <p className="overline">Response email</p>
            <p className="mono mt-1 break-all">
              {tournament.registration.responseEmail || "Not set"}
            </p>
            <p className="hint mt-1">
              The address registrations are answered from. It is not a login and this demo sends no
              mail.
            </p>
          </div>
          <div className="rounded-[12px] bg-surface-sunken p-3">
            <p className="overline">{tournament.registration.sponsorQuestion}</p>
            <p className="mt-1 text-[14px]">
              Asked on every registration. {entries.filter((e) => e.sponsor).length} of{" "}
              {entries.length} entries said yes so far.
            </p>
          </div>
          {tournament.registration.payment && (
            <div className="rounded-[12px] border border-warning bg-warning-soft p-3 sm:col-span-2">
              <p className="overline flex items-center gap-2 !text-warning">
                <Landmark className="size-4" aria-hidden="true" /> Payment instruction
              </p>
              <p className="mt-1 text-[14px]">
                <b>{tournament.registration.payment.method}</b> ·{" "}
                {tournament.registration.payment.bank} ·{" "}
                {tournament.registration.payment.accountName} ·{" "}
                <span className="mono">{tournament.registration.payment.accountNumber}</span>
              </p>
              <p className="hint mt-1">
                <b>Payment status is recorded by hand and starts pending.</b> Nothing is taken,
                checked, verified or confirmed here.
              </p>
            </div>
          )}
          <div className="rounded-[12px] bg-surface-sunken p-3 sm:col-span-2">
            <p className="overline">Tee-time choices</p>
            <ul className="mt-1 grid gap-1 text-[14px] sm:grid-cols-2">
              {tournament.registration.teeTimes.map((d) => (
                <li key={d.date} className="flex flex-wrap items-center gap-1.5">
                  <b>{d.label}:</b> {d.options.join(" or ")}
                  {d.needsConfirmation && (
                    <span className="pill warn">Needs organizer confirmation</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="hint mt-1">
              A tee time is saved as a <b>preference</b>, never as a confirmed start. Day 4 is kept
              exactly as supplied (“11:30PM Tee Off”) until the organizer confirms it.
            </p>
          </div>
        </div>
      </SectionCard>

      {savedId && savedReg && savedEntry && savedPlayer && (
        <SectionCard
          id="saved-h"
          icon={<CircleCheck />}
          title="Saved"
          subtitle="Confirmation summary."
        >
          <div className="notice ok" role="status">
            <b>
              {savedPlayer.name} is entered as a{savedEntry.role === "guest" ? " guest" : " member"}
              .
            </b>{" "}
            {status === "demo"
              ? "This is a local session draft: a page refresh clears it, and there is no server persistence, no payment, and no mail."
              : "Recorded on the club database. Payment stays manual and nothing is mailed."}
          </div>
          <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line sm:grid-cols-4">
            {[
              { label: "Role", value: savedEntry.role === "guest" ? "Guest" : "Member" },
              { label: "Sponsor", value: savedEntry.sponsor ? "Yes" : "No" },
              { label: "Shirt", value: savedEntry.shirt ?? "Not given" },
              {
                label: "Payment",
                value: PAYMENT_LABEL[savedEntry.paymentStatus],
              },
            ].map((f) => (
              <div
                key={f.label}
                className="grid content-start gap-0.5 bg-surface-raised px-3 py-2.5"
              >
                <dt className="text-[10.5px] leading-4 font-semibold tracking-[.08em] text-ink-muted uppercase">
                  {f.label}
                </dt>
                <dd className="m-0 font-semibold">{f.value}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-2">
            <p className="overline">Eligibility and routing review</p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={savedReg.status} />
              {savedReg.frozenOutdated && <span className="pill warn">Re-freeze needed</span>}
              {savedReg.staleIndex && <span className="pill warn">Old index</span>}
              <span className="hint">
                Frozen index {fmtIndex(savedReg.frozenIndex)}
                {savedReg.frozenEffectiveDate ? ` (record ${savedReg.frozenEffectiveDate})` : ""} ·
                category {savedReg.categoryId ?? "none"} · flight {savedReg.flightId ?? "none"}
              </span>
            </div>
            {savedReg.reasons.length > 0 && (
              <ul className="plain grid gap-1 text-[13px]">
                {savedReg.reasons.map((r, i) => (
                  <li key={`${r}-${i}`} className="flex items-start gap-2">
                    <TriangleAlert
                      className="mt-px size-4 shrink-0 text-warning"
                      aria-hidden="true"
                    />
                    {r}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/players/${savedPlayer.id}`}>Open profile</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={resetForm}>
                Add another
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <SectionCard
          id="form-h"
          icon={<ClipboardList />}
          title={draft.isNew ? "New player registration" : "Registration"}
          subtitle="Member and guest roles are separate and both link to a player record."
        >
          <form className="grid gap-5" onSubmit={save} noValidate>
            {!draft.player && !draft.isNew && (
              <div className="grid gap-2">
                <PlayerQuickPick
                  items={pickItems}
                  status={query.trim() ? "ready" : "idle"}
                  query={query}
                  onQueryChange={setQuery}
                  onSelect={(item) => {
                    set({
                      player: item.player,
                      isNew: false,
                      declaredWshId: item.player.ngapId ?? "",
                    });
                    setQuery("");
                  }}
                  label="1. Find the player"
                  hint="Type a name, nickname or NGAP ID. A player already in this event is flagged."
                  autoFocus
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="justify-self-start"
                  onClick={() => set({ isNew: true, player: null })}
                >
                  <UserPlus aria-hidden="true" /> New player
                </Button>
              </div>
            )}
            {(draft.player || draft.isNew) && (
              <div className="flex items-center gap-3 rounded-[12px] bg-surface-sunken p-3">
                {draft.player ? (
                  <Avatar name={draft.player.name} photo={photoOf(draft.player)} />
                ) : (
                  <span className="avatar" aria-hidden="true">
                    <UserRound className="size-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <b className="block truncate">
                    {draft.player ? draft.player.name : "New player record"}
                  </b>
                  <span className="hint">
                    {draft.player
                      ? draft.player.ngapId
                        ? `NGAP ${draft.player.ngapId}`
                        : "No NGAP ID on file"
                      : "Fill in identity, then the registration"}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={() => setDraft(emptyDraft())}
                  aria-label="Change participant"
                >
                  <X aria-hidden="true" /> Change
                </button>
              </div>
            )}

            {(draft.isNew || (!draft.player && false)) && (
              <fieldset className="grid gap-3.5 sm:grid-cols-2">
                <legend className="overline float-left mb-2 w-full">
                  Identity (required parts)
                </legend>
                <label className="field">
                  <span>Last name (required)</span>
                  <input
                    type="text"
                    value={draft.lastName}
                    onChange={(e) => set({ lastName: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>First name (required)</span>
                  <input
                    type="text"
                    value={draft.firstName}
                    onChange={(e) => set({ firstName: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Nickname</span>
                  <input
                    type="text"
                    value={draft.nickname}
                    onChange={(e) => set({ nickname: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Gender (required)</span>
                  <select
                    value={draft.gender}
                    onChange={(e) => set({ gender: e.target.value as "M" | "F" })}
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </label>
                <label className="field">
                  <span>Date of birth (required)</span>
                  <input
                    type="date"
                    value={draft.birthdate}
                    onChange={(e) => set({ birthdate: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Home course</span>
                  <input
                    type="text"
                    value={draft.homeCourse}
                    onChange={(e) => set({ homeCourse: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Contact number (required)</span>
                  <input
                    type="tel"
                    value={draft.contactNumber}
                    onChange={(e) => set({ contactNumber: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Email address</span>
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(e) => set({ email: e.target.value })}
                  />
                </label>
                <div className="grid gap-2.5 rounded-[12px] border border-dashed border-line-strong p-3 sm:col-span-2">
                  <label className="field">
                    <span>Photo (optional; placeholder if none)</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="text-[13px] text-ink-muted"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        setPhotoError("");
                        if (!f) return set({ photo: undefined });
                        try {
                          set({ photo: await shrinkPhoto(f) });
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
                  {draft.photo && (
                    <label className="check text-[13px]">
                      <input
                        type="checkbox"
                        checked={draft.consent}
                        onChange={(e) => set({ consent: e.target.checked })}
                      />
                      <span>
                        The player agrees to have their photo kept on file and used for check-in and
                        their player profile. Photos stay off public pages.
                      </span>
                    </label>
                  )}
                </div>
              </fieldset>
            )}

            {(draft.player || draft.isNew) && (
              <>
                <fieldset className="grid gap-3.5 sm:grid-cols-2">
                  <legend className="overline float-left mb-2 w-full">
                    Participant type and handicap the player gave
                  </legend>
                  <div
                    className="flex gap-2 sm:col-span-2"
                    role="radiogroup"
                    aria-label="Participant type"
                  >
                    {(["member", "guest"] as const).map((role) => (
                      <button
                        key={role}
                        type="button"
                        role="radio"
                        aria-checked={draft.role === role}
                        onClick={() => set({ role })}
                        className={cn(
                          "h-11 min-w-28 rounded-[10px] border px-4 font-semibold capitalize",
                          draft.role === role
                            ? "border-fairway bg-fairway-soft text-ink"
                            : "border-line-strong bg-surface-raised hover:bg-surface-sunken",
                        )}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                  <label className="field">
                    <span>WHS ID (as given)</span>
                    <input
                      type="text"
                      value={draft.declaredWshId}
                      onChange={(e) => set({ declaredWshId: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>WHS handicap as of 1 October 2026 (as given)</span>
                    <input
                      type="text"
                      value={draft.declaredWshHandicap}
                      onChange={(e) => set({ declaredWshHandicap: e.target.value })}
                      inputMode="decimal"
                      placeholder="e.g. 14.2"
                    />
                  </label>
                  <p className="hint sm:col-span-2">
                    These are recorded as supplied for the desk. Eligibility uses the imported NGAP
                    record only; this app never calculates an official index.
                  </p>
                </fieldset>

                <fieldset className="grid gap-3.5">
                  <legend className="overline float-left mb-2 w-full">
                    {tournament.registration.sponsorQuestion}
                  </legend>
                  <div className="flex gap-4">
                    {(["yes", "no"] as const).map((v) => (
                      <label key={v} className="check text-[14px]">
                        <input
                          type="radio"
                          name="sponsor"
                          value={v}
                          checked={draft.sponsor === v}
                          onChange={() => set({ sponsor: v })}
                        />
                        <span className="capitalize">{v}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="grid gap-3.5 sm:grid-cols-2">
                  <legend className="overline float-left mb-2 w-full">
                    Shirt sizes (members and guests are separate fields)
                  </legend>
                  <label className="field">
                    <span>Member shirt size</span>
                    <select
                      value={draft.memberShirt}
                      disabled={draft.role !== "member"}
                      onChange={(e) => set({ memberShirt: e.target.value })}
                    >
                      <option value="">—</option>
                      {tournament.registration.shirtSizes.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Guest shirt size</span>
                    <select
                      value={draft.guestShirt}
                      disabled={draft.role !== "guest"}
                      onChange={(e) => set({ guestShirt: e.target.value })}
                    >
                      <option value="">—</option>
                      {tournament.registration.shirtSizes.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <p className="hint sm:col-span-2">
                    Only the size for the selected role is saved on this entry. The other field is
                    disabled on purpose.
                  </p>
                </fieldset>

                <fieldset className="grid gap-3">
                  <legend className="overline float-left mb-2 w-full">
                    Game-date and tee-time preferences
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {tournament.registration.teeTimes.map((d) => (
                      <label key={d.date} className="field">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {d.label} · {fmtIso(d.date)}
                          {d.needsConfirmation && (
                            <span className="pill warn">Confirm the time</span>
                          )}
                        </span>
                        <select
                          value={draft.teePreferences[d.date] ?? ""}
                          onChange={(e) =>
                            set({
                              teePreferences: {
                                ...draft.teePreferences,
                                [d.date]: e.target.value,
                              },
                            })
                          }
                        >
                          <option value="">Not given</option>
                          {d.options.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <p className="hint">
                    Saved as preferences. The draw decides the real start; nothing here confirms a
                    tee time.
                  </p>
                </fieldset>

                {fee.length > 0 && (
                  <fieldset className="grid gap-3.5 sm:grid-cols-2">
                    <legend className="overline float-left mb-2 w-full">Event questions</legend>
                    {fee.map((f) => (
                      <label key={f.id} className="field">
                        <span>
                          {f.label}
                          {f.required ? "" : " (optional)"}
                        </span>
                        {f.type === "select" ? (
                          <select
                            value={draft.extra[f.id] ?? ""}
                            onChange={(e) =>
                              set({ extra: { ...draft.extra, [f.id]: e.target.value } })
                            }
                          >
                            <option value="">—</option>
                            {f.options.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        ) : f.type === "checkbox" ? (
                          <input
                            type="checkbox"
                            checked={draft.extra[f.id] === "yes"}
                            onChange={(e) =>
                              set({
                                extra: { ...draft.extra, [f.id]: e.target.checked ? "yes" : "no" },
                              })
                            }
                          />
                        ) : (
                          <input
                            type={f.type === "number" ? "number" : "text"}
                            value={draft.extra[f.id] ?? ""}
                            onChange={(e) =>
                              set({ extra: { ...draft.extra, [f.id]: e.target.value } })
                            }
                          />
                        )}
                        {f.help && <span className="hint">{f.help}</span>}
                      </label>
                    ))}
                  </fieldset>
                )}

                <label className="field sm:max-w-[20rem]">
                  <span>Payment status (recorded by hand)</span>
                  <select
                    value={draft.paymentStatus}
                    onChange={(e) => set({ paymentStatus: e.target.value as PaymentStatus })}
                  >
                    {(
                      ["not_recorded", "pending", "recorded_paid", "waived"] as PaymentStatus[]
                    ).map((s) => (
                      <option key={s} value={s}>
                        {PAYMENT_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>

                {errors.length > 0 && (
                  <div className="notice bad" role="alert">
                    <b>
                      Please fix {errors.length} item{errors.length === 1 ? "" : "s"}:
                    </b>
                    <ul>
                      {errors.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                  <Button type="button" variant="ghost" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary">
                    <BadgeCheck aria-hidden="true" /> Save registration
                  </Button>
                </div>
              </>
            )}
          </form>
        </SectionCard>

        <SectionCard
          id="list-h"
          icon={<Search />}
          title={`Registrations (${entries.length})`}
          subtitle="Everyone entered in this event. This list is session-only demo data."
          action={
            <Button
              variant="secondary"
              size="sm"
              disabled={entries.length === 0}
              onClick={() => {
                for (const e of entries) {
                  if (regById.get(e.playerId)?.frozenOutdated) {
                    dispatch({ type: "refreeze", tournamentId: tournament.id, entryIds: [e.id] });
                  }
                }
              }}
            >
              <RefreshCw aria-hidden="true" /> Re-freeze outdated
            </Button>
          }
        >
          <label className="field">
            <span className="sr">Filter registrations</span>
            <input
              type="search"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="Filter by name, NGAP ID or role"
            />
          </label>
          <ul className="plain grid gap-2">
            {listRows.map(({ e, r, p }) => {
              if (!p) return null;
              return (
                <li
                  key={e.id}
                  className="grid gap-2 rounded-[12px] border border-line p-3 sm:flex sm:items-center sm:gap-3"
                >
                  <Avatar name={p.name} photo={photoOf(p)} />
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/players/${p.id}`}
                      className="block truncate font-semibold text-ink no-underline hover:underline"
                    >
                      {p.name}
                    </Link>
                    <span className="hint block">
                      {e.role === "guest" ? "Guest" : "Member"}
                      {e.sponsor ? " · sponsor" : ""} · shirt {e.shirt ?? "—"} · frozen{" "}
                      {fmtIndex(r?.frozenIndex ?? null)}
                      {r?.frozenEffectiveDate ? ` (${r.frozenEffectiveDate})` : ""}
                    </span>
                    <span className="hint block">
                      Payment: {PAYMENT_LABEL[e.paymentStatus]}
                      {Object.values(e.teePreferences).some(Boolean)
                        ? ` · prefers ${Object.values(e.teePreferences).filter(Boolean).join(", ")}`
                        : " · no tee preference given"}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {r && <StatusPill status={r.status} />}
                    {r?.frozenOutdated && <span className="pill warn">Re-freeze</span>}
                    {r?.staleIndex && <span className="pill warn">Old index</span>}
                    {r?.frozenOutdated && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          dispatch({
                            type: "refreeze",
                            tournamentId: tournament.id,
                            entryIds: [e.id],
                          })
                        }
                      >
                        <RefreshCw aria-hidden="true" /> Re-freeze
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${p.name} from this event`}
                      className="text-ink-muted hover:text-danger"
                      onClick={() => dispatch({ type: "removeEntry", id: e.id })}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </span>
                </li>
              );
            })}
            {listRows.length === 0 && (
              <li className="card muted">
                {entries.length === 0
                  ? "No registrations in this event yet. This sample event starts empty."
                  : "No registration matches that filter."}
              </li>
            )}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
