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
import {
  eligibilityView,
  missingRequiredFields,
  PAYMENT_OPTIONS,
  type PlayerPickItem,
  PlayerQuickPick,
  RegisterConfirm,
  RegistrationDaysEditor,
  RegistrationTeam,
  SaveTruth,
  type TeamPlayer,
} from "@/components/desk";
import { ReadyOverrideDialog } from "@/components/desk/ReadyOverrideDialog";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { Pager } from "@/components/paging/Pager";
import { usePagedList } from "@/components/paging/usePagedList";
import { Button } from "@/components/ui/button";
import type { DaySessionChoice } from "@/lib/data/day-selection";
import { selectIndexForCutOff } from "@/lib/data/frozen";
import { instructionText } from "@/lib/data/instructions";
import { fmtIso } from "@/lib/data/labels";
import { daySessionSummary, registeredDayBadges } from "@/lib/data/sessions";
import {
  type DeskRegistration,
  PAYMENT_LABEL,
  type PaymentStatus,
  type PlayerRecord,
  type RegistrationEntry,
} from "@/lib/data/types";
import { displayName, fmtIndex, photoOf } from "@/lib/format";
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
  publicConsent: boolean;
  role: "member" | "guest";
  sponsor: "yes" | "no" | "";
  memberShirt: string;
  guestShirt: string;
  declaredWshId: string;
  declaredWshHandicap: string;
  selectedDays: number[];
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
  publicConsent: false,
  role: "member",
  sponsor: "",
  memberShirt: "",
  guestShirt: "",
  declaredWshId: "",
  declaredWshHandicap: "",
  selectedDays: [],
  teePreferences: {},
  extra: {},
  paymentStatus: "not_recorded",
});

/**
 * `RegistrationRepository.add` returns the entry. The connected adapter also attaches the database
 * write to it as `saved`, so this screen can wait for the row before it says the entry was saved.
 * Demo mode returns the entry alone, and there is nothing to wait for.
 */
type SavingEntry = RegistrationEntry & { saved?: Promise<void> };

/** One listed entry with the player record that is guaranteed to be loaded. */
type ListRow = { e: RegistrationEntry; r: DeskRegistration | undefined; p: PlayerRecord };

function RegisterDesk() {
  const {
    tournament,
    players,
    entries,
    regById,
    adapters,
    status,
    names,
    days,
    tees,
    member,
    reload,
  } = useDesk();
  const canEdit = status === "demo" || member?.role === "owner" || member?.role === "organizer";
  /** Payment is a desk job: the desk role may record it even though it cannot override routing. */
  const canRecordPayment =
    status === "demo" ||
    member?.role === "owner" ||
    member?.role === "organizer" ||
    member?.role === "desk";
  /** Bulk confirmation writes to the database, so it is offered only on the connected desk. */
  const canConfirmMany =
    status === "ready" &&
    (member?.role === "owner" || member?.role === "organizer" || member?.role === "desk");
  /** The entry whose incomplete profile the organizer is overriding. */
  const [override, setOverride] = useState<{
    player: PlayerRecord;
    entry: RegistrationEntry;
    registration: DeskRegistration;
  } | null>(null);
  const params = useSearchParams();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [listQuery, setListQuery] = useState("");
  const [step, setStep] = useState<"form" | "review">("form");
  /** The desk works the list first; the entry form has its own tab so neither is squeezed. */
  const [view, setView] = useState<"list" | "new">("list");
  /** True while the entry write is running, so the review button cannot be pressed twice. */
  const [savingEntry, setSavingEntry] = useState(false);
  /** Why the entry was not saved. Shown on the review screen; nothing was written. */
  const [entryError, setEntryError] = useState("");
  /** Why a list action failed (re-freeze or remove). The list itself is unchanged by a failure. */
  const [listError, setListError] = useState("");
  /** The entry the desk is about to remove, for the confirmation below the list. */
  const [removeAsk, setRemoveAsk] = useState<{ id: string; name: string } | null>(null);
  /** The batch the desk is about to confirm, with how many listed rows the desk must leave out. */
  const [bulkAsk, setBulkAsk] = useState<{ ids: string[]; skipped: number } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkNotice, setBulkNotice] = useState("");

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
  // The event accepts the player's index on the cut-off day: the last NGAP record on or before it,
  // never a later import. A later record is reported so the desk can see it exists, and the dialog
  // cannot seed itself from it.
  const cutOffIndex = override
    ? selectIndexForCutOff(
        adapters.players.recordsFor(override.player.id),
        tournament?.cutOffDate ?? "",
      )
    : null;

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

  /** Rows whose player record is loaded. The rest cannot be shown, so they are left out. */
  const knownRows = useMemo(
    () => listRows.filter((row): row is ListRow => Boolean(row.p)),
    [listRows],
  );

  // The desk works a member and their guest as one team, so a pair from the club sheet becomes one
  // card: the guest on the left, the member on the right. Each player is still their own entry, so
  // one partner's status or buttons never stand for the other's. Paging counts teams, not entries,
  // and the order is stable so editing one player cannot move the card to another page.
  const teams = useMemo(() => {
    const byNumber = new Map<number, ListRow[]>();
    const solo: ListRow[] = [];
    for (const row of knownRows) {
      const teamNo = row.e.teamNo;
      if (teamNo === null || teamNo === undefined) {
        solo.push(row);
        continue;
      }
      const list = byNumber.get(teamNo) ?? [];
      list.push(row);
      byNumber.set(teamNo, list);
    }
    // One card per member and guest. A number that somehow carries three entries (a duplicate on
    // the club sheet) still shows every one of them: the extra player gets a card of their own
    // rather than disappearing from the list.
    const grouped: { key: string; number: number | null; rows: ListRow[] }[] = [];
    for (const [number, rows] of byNumber) {
      const members = rows.filter((row) => row.e.role === "member");
      const guests = rows.filter((row) => row.e.role === "guest");
      const cards = Math.max(members.length, guests.length);
      for (let at = 0; at < cards; at += 1) {
        const pair = [members[at], guests[at]].filter((row): row is ListRow => Boolean(row));
        grouped.push({ key: `pair-${number}-${at}`, number, rows: pair });
      }
    }
    grouped.push(...solo.map((row) => ({ key: row.e.id, number: null, rows: [row] })));
    const lead = (team: { rows: ListRow[] }) =>
      (team.rows.find((row) => row.e.role === "member") ?? team.rows[0])?.p.name ?? "";
    return grouped.sort((a, b) => lead(a).localeCompare(lead(b)) || a.key.localeCompare(b.key));
  }, [knownRows]);
  const { page, setPage } = usePagedList(teams, listQuery);

  // Bulk confirmation takes every entry the database still holds as needs_review, except the two
  // that are about identity or eligibility: a duplicated display name in this event, and an entry
  // the router already called ineligible. Missing birthdate, gender or handicap index no longer
  // blocks confirmation: such an entry is confirmed as provisional, plays today and is corrected
  // tomorrow. The database flips the status; it never invents the missing facts.
  const bulkTargets = useMemo(() => {
    // Count only the names in this event: a namesake elsewhere in the club is not an ambiguous
    // entry. Two entered players with the same display name are, and neither is confirmed here.
    const nameCounts = new Map<string, number>();
    for (const entry of entries) {
      const player = players.find((x) => x.id === entry.playerId);
      if (!player) continue;
      const key = player.name.trim().toLowerCase();
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    }
    return listRows.filter(({ e, p }) => {
      if (!p) return false;
      // Already ok, or the desk called it not eligible. Neither is a bulk-confirm candidate.
      if (e.status !== "needs_review") return false;
      const r = regById.get(p.id);
      // `ineligible` needs a known age, so it can only happen when a birthdate exists.
      if (!r || r.status === "ineligible") return false;
      return (nameCounts.get(p.name.trim().toLowerCase()) ?? 0) <= 1;
    });
  }, [entries, listRows, players, regById]);
  const listedNeedsReview = useMemo(
    () => listRows.filter(({ e }) => e.status === "needs_review").length,
    [listRows],
  );

  async function saveDays(
    entry: RegistrationEntry,
    next: number[],
    sessions: Record<number, DaySessionChoice> = {},
  ) {
    if (tournament?.requiredDays !== null && tournament?.requiredDays !== undefined) {
      if (next.length !== tournament.requiredDays) {
        throw new Error(`This event requires exactly ${tournament.requiredDays} playing day(s).`);
      }
    }
    if (tournament?.maxDays !== null && tournament?.maxDays !== undefined) {
      if (next.length > tournament.maxDays) {
        throw new Error(`This event allows at most ${tournament.maxDays} playing day(s).`);
      }
    }
    await adapters.registrations.setDays(entry.id, next, sessions);
  }

  if (!tournament) return <NeedsTournament what="The registration desk" />;

  const instructions = instructionText(tournament.registration.instructions);
  // Captured after the "no tournament" return so the handlers below keep a plain string.
  const tournamentId = tournament.id;
  // The last playing day's second session is the 11:30 one, so the day lists and the editor must
  // agree on which days count. A non-playing day in between is not offered for selection.
  const playingDays = days.filter((day) => day.isPlayingDay);

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
    if (tournament?.requiredDays !== null && tournament?.requiredDays !== undefined) {
      if (draft.selectedDays.length !== tournament.requiredDays) {
        out.push(`This event requires exactly ${tournament.requiredDays} playing day(s).`);
      }
    }
    if (tournament?.maxDays !== null && tournament?.maxDays !== undefined) {
      if (draft.selectedDays.length > tournament.maxDays) {
        out.push(`This event allows at most ${tournament.maxDays} playing day(s).`);
      }
    }
    for (const f of tournament?.registration.fields ?? []) {
      if (!f.required) continue;
      if (f.appliesTo !== "both" && f.appliesTo !== draft.role) continue;
      if (f.type === "checkbox") continue;
      if (!(draft.extra[f.id] ?? "").trim()) out.push(`${f.label} is required.`);
    }
    return out;
  }

  function review(e: React.FormEvent) {
    e.preventDefault();
    const problems = validate();
    setErrors(problems);
    if (problems.length === 0) {
      // A fresh review: an error from the previous attempt belongs to the previous attempt.
      setEntryError("");
      setStep("review");
    }
  }

  async function commit() {
    if (savingEntry) return;
    // While the desk is loading or has failed, the provider hands out the session adapters, which
    // would keep the entry on this screen only. Refuse rather than claim a save that cannot happen.
    if (status !== "demo" && status !== "ready") {
      setEntryError("The desk has not finished loading. Wait for it, then save again.");
      return;
    }
    setSavingEntry(true);
    setEntryError("");

    try {
      // A new player is added to the directory first. Reuse the record only if it is still there:
      // a failed player write takes it back out, and a retry must create it again rather than
      // point at a row that does not exist.
      const knownPlayer = players.find((p) => p.id === draft.player?.id) ?? null;
      let player = knownPlayer;
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
          photoPublicConsent: draft.photo && draft.consent ? draft.publicConsent : undefined,
        });
        // Keep the new record on the draft, so a retry after a failed save reuses it instead of
        // creating a second player.
        const newPlayer = player;
        setDraft((d) => ({ ...d, player: newPlayer, isNew: false }));
      }

      // The database is unique on (event, player), so this would be rejected there. Say it plainly
      // here instead of letting the desk read a constraint error.
      if (entries.some((e) => e.playerId === player.id)) {
        setErrors([`${player.name} is already entered in this event.`]);
        return;
      }

      const created = adapters.registrations.add(tournament?.id as string, {
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
        selectedDays: draft.selectedDays,
        declaredWshId: draft.declaredWshId.trim() || null,
        declaredWshHandicap: draft.declaredWshHandicap.trim() || null,
        extra: draft.extra,
        paymentStatus: draft.paymentStatus,
      });

      // Wait for the database before claiming the entry was recorded. The connected adapter takes
      // the optimistic entry off the list itself if the write is refused.
      await (created as SavingEntry).saved;

      setSavedId(player.id);
      setStep("form");
    } catch (error) {
      // The review stays on screen: nothing was written, and the old index or entry is untouched.
      setEntryError(error instanceof Error ? error.message : "The entry was not saved. Try again.");
    } finally {
      setSavingEntry(false);
    }
  }

  /**
   * Re-freezes one entry or every outdated one. The connected adapter writes the row first and
   * updates the screen afterwards, so a refused write leaves the old index visible.
   */
  async function refreeze(entryIds: string[]) {
    setListError("");
    try {
      // The connected adapter returns its write promise even though the repository type says void,
      // so this screen waits for the rows instead of assuming they were saved.
      await adapters.registrations.refreeze(tournament?.id as string, entryIds);
    } catch (error) {
      setListError(
        error instanceof Error
          ? error.message
          : "Could not re-freeze the index. The old one is still in place.",
      );
    }
  }

  /** Removes an entry after the confirmation. A refused delete puts the row back. */
  async function removeEntry(target: { id: string; name: string }) {
    setRemoveAsk(null);
    setListError("");
    try {
      // Same as refreeze: the adapter's promise settles when the database answers.
      await adapters.registrations.remove(target.id);
    } catch (error) {
      setListError(
        error instanceof Error
          ? error.message
          : `${target.name} was not removed. The entry is still in this event.`,
      );
    }
  }

  /**
   * Records a payment status on an existing entry. The connected adapter puts the old value back
   * when the database refuses it, so the control cannot keep showing a change that was not saved.
   */
  async function savePayment(entryId: string, next: PaymentStatus) {
    setListError("");
    try {
      await adapters.registrations.update(entryId, { paymentStatus: next });
    } catch (error) {
      setListError(
        error instanceof Error
          ? error.message
          : "Could not change the payment status. The old value is still in place.",
      );
    }
  }

  /** Confirms the batch the desk agreed to, then reloads the list from the database. */
  async function runBulkConfirm() {
    if (!bulkAsk || bulkBusy) return;
    const { ids } = bulkAsk;
    setBulkBusy(true);
    setBulkError("");
    setBulkNotice("");
    try {
      const count = await adapters.registrations.confirmMany(tournamentId, ids);
      setBulkAsk(null);
      setBulkNotice(
        count === ids.length
          ? `${count} registration${count === 1 ? "" : "s"} confirmed.`
          : `${count} of ${ids.length} confirmed. The rest were already confirmed or are no longer waiting.`,
      );
      reload();
    } catch (error) {
      // Nothing on this screen was changed before the call, so the list stays as it was.
      setBulkError(
        error instanceof Error
          ? error.message
          : "The registrations were not confirmed. Nothing was changed.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  function resetForm() {
    setDraft(emptyDraft());
    setErrors([]);
    setSavedId(null);
    setQuery("");
    setPhotoError("");
    setEntryError("");
    setRemoveAsk(null);
    setStep("form");
  }

  /** Everything one player's column shows: their own days, status, missing facts and buttons. */
  function slotFor({ e, r, p }: ListRow): TeamPlayer & { role: "member" | "guest" } {
    const provisional = r?.provisional === true;
    const selectedDays = e.selectedDays ?? [];
    const preferred = Object.entries(e.teePreferences)
      .filter(([date, value]) => {
        if (!value) return false;
        return selectedDays.some(
          (dayNumber) => playingDays.find((day) => day.dayNumber === dayNumber)?.playDate === date,
        );
      })
      .map(([, value]) => value);
    // Every registered day carries AM or PM. The desk's session wins, a stored tee time decides
    // when there is no choice, and an unset day shows the day's morning default.
    const dayLabels = registeredDayBadges(e, playingDays).map(
      (badge) => `${badge.dayLabel} · ${badge.label} ${badge.time}`,
    );
    const note = [
      e.shirt ? `shirt ${e.shirt}` : null,
      preferred.length > 0 ? `prefers ${preferred.join(", ")}` : "no tee preference given",
    ]
      .filter((part): part is string => part !== null)
      .join(" · ");
    return {
      role: e.role,
      name: p.name,
      photo: photoOf({ photo: p.photo, photoConsent: p.photoConsent }),
      profileHref: `/players/${p.id}`,
      status: r?.status ?? null,
      index: r?.frozenIndex ?? null,
      playingHandicap: r?.playingHandicap ?? null,
      flightName: r && r.flightId ? names.flight(r.flightId) : provisional ? "Unclassified" : null,
      days: dayLabels,
      note,
      // Missing facts belong to the player who is missing them, never to the pair.
      missing: provisional ? (r?.missing ?? []) : [],
      overridden: e.overridden,
      overrideReason: e.overrideReason ?? null,
      actions: (
        <>
          <PaymentEditor
            entry={e}
            name={p.name}
            disabled={!canRecordPayment}
            onSave={(next) => savePayment(e.id, next)}
          />
          {canEdit && r?.status === "needs_review" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOverride({ player: p, entry: e, registration: r })}
            >
              <BadgeCheck aria-hidden="true" />
              Mark ready
            </Button>
          )}
          <RegistrationDaysEditor
            entry={e}
            days={playingDays}
            required={tournament?.requiredDays ?? null}
            max={tournament?.maxDays ?? null}
            onSave={(next, sessions) => saveDays(e, next, sessions)}
          />
          {r?.frozenOutdated && (
            <Button variant="secondary" size="sm" onClick={() => void refreeze([e.id])}>
              <RefreshCw aria-hidden="true" /> Re-freeze
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Remove ${p.name} from this event`}
            className="text-ink-muted hover:text-danger"
            onClick={() => setRemoveAsk({ id: e.id, name: p.name })}
          >
            <X aria-hidden="true" />
          </Button>
        </>
      ),
    };
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        overline="Entries"
        title="Registration desk"
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
              {savedReg.provisional && (
                <span className="pill warn">
                  Provisional · missing {savedReg.missing.join(", ")}
                </span>
              )}
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

      {/* One tab at a time, each full width: the list is a working table, not a column beside a
          form, and a long name or a pair chip has the room to show. */}
      <div className="seg" role="tablist" aria-label="Registration desk">
        <button
          type="button"
          role="tab"
          aria-selected={view === "list"}
          aria-pressed={view === "list"}
          onClick={() => setView("list")}
        >
          Registrations ({entries.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "new"}
          aria-pressed={view === "new"}
          onClick={() => setView("new")}
        >
          New registration
        </button>
      </div>

      {view === "new" && step === "form" && (
        <SectionCard
          id="form-h"
          icon={<ClipboardList />}
          title={draft.isNew ? "New player registration" : "Registration"}
          subtitle="Member and guest roles are separate and both link to a player record."
        >
          <form className="grid gap-5" onSubmit={review} noValidate>
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
                        if (!f)
                          return set({
                            photo: undefined,
                            consent: false,
                            publicConsent: false,
                          });
                        try {
                          set({
                            photo: await shrinkPhoto(f),
                            consent: false,
                            publicConsent: false,
                          });
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
                    <>
                      <label className="check text-[13px]">
                        <input
                          type="checkbox"
                          checked={draft.consent}
                          onChange={(e) =>
                            set({
                              consent: e.target.checked,
                              ...(e.target.checked ? {} : { publicConsent: false }),
                            })
                          }
                        />
                        <span>
                          The player agrees to have their photo kept on file and used for check-in,
                          their player profile and tournament posters.
                        </span>
                      </label>
                      <label className="check text-[13px]">
                        <input
                          type="checkbox"
                          checked={draft.publicConsent}
                          disabled={!draft.consent}
                          onChange={(e) => set({ publicConsent: e.target.checked })}
                        />
                        <span>
                          Separately, the player agrees this photo may appear on public pairings,
                          the public leaderboard and printed start sheets. Optional.
                        </span>
                      </label>
                    </>
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
                  <legend className="overline float-left mb-2 w-full">Playing days</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {playingDays.map((day, index) => {
                      const checked = draft.selectedDays.includes(day.dayNumber);
                      return (
                        <label
                          key={day.id}
                          className="flex items-start gap-2 rounded-[10px] border border-line px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={() =>
                              set({
                                selectedDays: checked
                                  ? draft.selectedDays.filter((n) => n !== day.dayNumber)
                                  : [...draft.selectedDays, day.dayNumber].sort((a, b) => a - b),
                              })
                            }
                          />
                          <span className="min-w-0">
                            <b className="block">
                              {day.label} · {fmtIso(day.playDate)}
                            </b>
                            <span className="hint block">
                              {daySessionSummary(index, playingDays.length)}
                            </span>
                            {day.startTime && (
                              <span className="hint block">The day opens at {day.startTime}</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="hint">
                    {tournament.requiredDays !== null && tournament.requiredDays !== undefined
                      ? `This event requires exactly ${tournament.requiredDays} day(s).`
                      : tournament.maxDays !== null && tournament.maxDays !== undefined
                        ? `Choose up to ${tournament.maxDays} day(s).`
                        : "Choose the days this player is entered for. The desk can change them later."}
                  </p>
                </fieldset>

                <fieldset className="grid gap-3">
                  <legend className="overline float-left mb-2 w-full">
                    Tee-time preferences for the selected days
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {tournament.registration.teeTimes
                      .filter((d) => {
                        const day = playingDays.find((x) => x.playDate === d.date);
                        return day ? draft.selectedDays.includes(day.dayNumber) : false;
                      })
                      .map((d) => (
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
                                extra: {
                                  ...draft.extra,
                                  [f.id]: e.target.checked ? "yes" : "no",
                                },
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
                  <Button type="submit" variant="primary" data-help="register-review">
                    <BadgeCheck aria-hidden="true" /> Review entry
                  </Button>
                </div>
              </>
            )}
          </form>
        </SectionCard>
      )}

      {view === "new" &&
        step === "review" &&
        (() => {
          const p = draft.player;
          const reg = p ? regById.get(p.id) : null;
          const item: PlayerPickItem = p
            ? (pickItems.find((i) => i.player.id === p.id) ?? {
                player: p,
                index: reg?.frozenIndex ?? null,
                categoryName: reg?.categoryId ? names.category(reg.categoryId) : null,
                playingHandicap: reg?.playingHandicap ?? null,
                alreadyRegistered: entries.some((e) => e.playerId === p.id),
              })
            : {
                player: {
                  id: "new",
                  clubId: tournament.clubId,
                  firstName: draft.firstName,
                  lastName: draft.lastName,
                  nickname: draft.nickname || null,
                  name: displayName(`${draft.firstName} ${draft.lastName}`.trim() || "New player"),
                  fullName: `${draft.firstName} ${draft.lastName}`.trim() || "New player",
                  birthdate: draft.birthdate || null,
                  gender: draft.gender,
                  homeCourse: draft.homeCourse || null,
                  contactNumber: draft.contactNumber || null,
                  email: draft.email || null,
                  ngapId: draft.ngapId || null,
                  createdAt: new Date().toISOString(),
                },
                index: null,
                categoryName: null,
                playingHandicap: null,
                alreadyRegistered: false,
              };
          const existing = p ? entries.find((e) => e.playerId === p.id) : undefined;
          const payment = tournament.registration.payment;

          return (
            <SectionCard
              id="review-h"
              icon={<BadgeCheck />}
              title="Review the entry"
              subtitle="Exactly what will be written. Nothing is saved until you confirm."
            >
              <RegisterConfirm
                event={{
                  name: tournament.name,
                  dateLabel: `${tournament.dates[0]} to ${tournament.dates[tournament.dates.length - 1]}`,
                  cutOffLabel: fmtIso(tournament.cutOffDate),
                  formatLabel:
                    tournament.config.startFormat === "shotgun" ? "Shotgun start" : "Two-tee start",
                  needsConfirmationNote:
                    tournament.nameNeedsConfirmation || tournament.scheduleNeedsConfirmation
                      ? "The event name and the schedule still need the organizer's confirmation."
                      : null,
                }}
                participant={{
                  item,
                  role: draft.role,
                  onRoleChange: (role) => set({ role }),
                }}
                routing={{
                  categoryName: item.categoryName,
                  teeName: reg?.teeId ? names.tee(reg.teeId) : null,
                  flightName: reg?.flightId ? names.flight(reg.flightId) : null,
                  playingHandicap: item.playingHandicap ?? null,
                  index: item.index,
                  // A new player is routed by the engine only once the record exists.
                  previewLabel: p ? null : "A new player is routed when the entry is saved.",
                }}
                eligibility={eligibilityView({
                  status: reg?.status ?? "ok",
                  reasons: reg?.reasons ?? [],
                  index: item.index,
                  maxIndex: tournament.config.maxIndex,
                })}
                duplicate={
                  existing
                    ? {
                        name: item.player.name,
                        detail: "Already entered in this event.",
                        blocking: true,
                      }
                    : null
                }
                missingFields={missingRequiredFields(
                  tournament.registration.fields,
                  draft.extra,
                  draft.role,
                )}
                fieldValues={draft.extra}
                onFieldChange={(fieldId, value) =>
                  set({ extra: { ...draft.extra, [fieldId]: value } })
                }
                paymentStatus={draft.paymentStatus}
                onPaymentStatusChange={(paymentStatus) => set({ paymentStatus })}
                paymentNote={
                  payment
                    ? `${payment.method} · ${payment.bank} · ${payment.accountName} · ${payment.accountNumber}`
                    : null
                }
                saveTarget={status === "demo" ? "session" : "database"}
                confirmLabel="Confirm and save entry"
                saving={savingEntry}
                onConfirm={() => void commit()}
                onCancel={() => setStep("form")}
              />
              {entryError && (
                <div className="notice bad" role="alert">
                  <b>Not saved.</b> {entryError} Nothing was written, so the entry is not in the
                  event. Press save again to retry.
                </div>
              )}
            </SectionCard>
          );
        })()}

      {view === "list" && (
        <SectionCard
          id="list-h"
          icon={<Search />}
          dataHelp="register-list"
          title={`Registrations (${entries.length})`}
          subtitle={
            status === "demo"
              ? "Everyone entered in this event. This list is session-only demo data."
              : "Everyone entered in this event."
          }
          action={
            <span className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={reload}
                disabled={status === "demo"}
                title={
                  status === "demo"
                    ? "This build has no database to refresh from"
                    : "Reload this event from the club database"
                }
              >
                <RefreshCw aria-hidden="true" /> Reload from database
              </Button>
              {canConfirmMany && listedNeedsReview > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={bulkBusy || bulkTargets.length === 0}
                  title={
                    bulkTargets.length === 0
                      ? "Every parked entry is either not eligible or shares a name with another entry. Fix or review those rows first."
                      : "Confirms the entries in the current list filter, not only this page. An entry missing a birthdate, gender or handicap index is confirmed as provisional."
                  }
                  onClick={() =>
                    setBulkAsk({
                      ids: bulkTargets.map(({ e }) => e.id),
                      skipped: listedNeedsReview - bulkTargets.length,
                    })
                  }
                >
                  <BadgeCheck aria-hidden="true" /> Confirm {bulkTargets.length} shown
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={entries.length === 0}
                onClick={() =>
                  void refreeze(
                    entries.filter((e) => regById.get(e.playerId)?.frozenOutdated).map((e) => e.id),
                  )
                }
              >
                <RefreshCw aria-hidden="true" /> Re-freeze outdated
              </Button>
            </span>
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
          {listError && (
            <div className="notice bad" role="alert">
              {listError}
            </div>
          )}
          {canConfirmMany && listedNeedsReview > 0 && bulkTargets.length === 0 && (
            <div className="notice warn" role="status">
              <b>{listedNeedsReview} entries are parked as needs review</b>, but none can be
              confirmed in bulk: each one is not eligible or shares a display name with another
              entry in this event. Fix those rows first, then confirm them here.
            </div>
          )}
          {bulkNotice && (
            <div className="notice ok" role="status">
              {bulkNotice}
            </div>
          )}
          {bulkError && (
            <div className="notice bad" role="alert">
              <b>Not confirmed.</b> {bulkError}
            </div>
          )}
          {bulkAsk && (
            <div className="notice warn" role="alert">
              <b>
                Confirm {bulkAsk.ids.length} registration
                {bulkAsk.ids.length === 1 ? "" : "s"} as ready?
              </b>{" "}
              These are the entries in the current list filter that the desk can stand behind. An
              entry missing a birthdate, a gender or a handicap index is confirmed as{" "}
              <b>provisional</b>: it goes into the draw under “Unclassified” today, and the desk
              corrects the missing detail tomorrow.{" "}
              {bulkAsk.skipped > 0 &&
                `${bulkAsk.skipped} more listed ${
                  bulkAsk.skipped === 1 ? "entry is" : "entries are"
                } left out because ${bulkAsk.skipped === 1 ? "it is" : "they are"} not eligible or share a display name with another entry. `}
              This writes the status straight to the club database. There is no undo in this screen,
              so a mistake needs a manual correction.
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={bulkBusy}
                  onClick={() => void runBulkConfirm()}
                >
                  <BadgeCheck aria-hidden="true" />{" "}
                  {bulkBusy ? "Confirming…" : `Yes, confirm ${bulkAsk.ids.length}`}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={bulkBusy}
                  onClick={() => setBulkAsk(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {removeAsk && (
            <div className="notice warn" role="alert">
              <b>Remove {removeAsk.name} from this event?</b>{" "}
              {status === "demo"
                ? "The entry is removed from this session only."
                : "The entry is deleted from the club database. The player record and their handicap history stay."}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="danger" size="sm" onClick={() => void removeEntry(removeAsk)}>
                  Yes, remove the entry
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRemoveAsk(null)}>
                  Keep it
                </Button>
              </div>
            </div>
          )}
          {/* One card per team, with its own column titles: Guest on the left, Member on the right.
              Each player keeps their own days, status and buttons, so nothing one partner does is
              read as the other's. */}
          <div className="grid gap-2.5">
            {page.items.map((team) => {
              const slots = team.rows.map((row) => slotFor(row));
              return (
                <RegistrationTeam
                  key={team.key}
                  number={team.number}
                  guest={slots.find((slot) => slot.role === "guest") ?? null}
                  member={slots.find((slot) => slot.role === "member") ?? null}
                />
              );
            })}
            {page.total === 0 && (
              <p className="card muted">
                {entries.length === 0
                  ? "No registrations in this event yet."
                  : "No registration matches that filter."}
              </p>
            )}
          </div>
          <Pager page={page} onPage={setPage} />
        </SectionCard>
      )}

      <SectionCard
        id="instructions-h"
        icon={<Info />}
        title="Event instructions"
        subtitle="Shown to the desk while taking a registration."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {/* The organizer writes these for the desk, so the desk has to be able to read them.
              Line breaks are kept: a four-step instruction list must not become one sentence. */}
          <div className="rounded-[12px] bg-surface-sunken p-3 sm:col-span-2">
            <p className="overline">What to tell players</p>
            {instructions ? (
              <p className="mt-1 text-[14px] whitespace-pre-wrap">{instructions}</p>
            ) : (
              <p className="hint mt-1">
                None set. Add them under Registration in{" "}
                <Link href="/setup#registration">Settings</Link> so the desk and the entry form say
                the same thing.
              </p>
            )}
          </div>
          <div className="rounded-[12px] bg-surface-sunken p-3">
            <p className="overline">Response email</p>
            <p className="mono mt-1 break-all">
              {tournament.registration.responseEmail || "Not set"}
            </p>
            <p className="hint mt-1">
              The address registrations are answered from. It is not a login and TeeLine sends no
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
                <b>Payment status is recorded by hand and starts as not recorded.</b> Nothing is
                taken, checked, verified or confirmed here.
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

      {override && (
        <ReadyOverrideDialog
          key={override.player.id}
          open
          onOpenChange={(open) => {
            if (!open) setOverride(null);
          }}
          player={override.player}
          entry={override.entry}
          registration={override.registration}
          tournament={tournament}
          tees={tees}
          cutOffDate={tournament?.cutOffDate ?? null}
          cutOffIndex={cutOffIndex?.index ?? null}
          cutOffIndexDate={cutOffIndex?.record?.effectiveDate ?? null}
          newerIndexDate={cutOffIndex?.newer?.effectiveDate ?? null}
          onSave={(input) => {
            // A blank birthdate is normal for a guest: leave the player record untouched.
            if (input.birthdate) {
              adapters.players.update(override.player.id, { birthdate: input.birthdate });
            }
            // The row changes on screen only when the write lands; a refusal leaves it in review.
            void adapters.registrations.overrideReady(override.entry.id, input);
            setOverride(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * The payment status on one registration, editable in place. The value comes from the entry, so a
 * refused write that the adapter has already rolled back appears here without extra work.
 */
function PaymentEditor({
  entry,
  name,
  disabled,
  onSave,
}: {
  entry: RegistrationEntry;
  name: string;
  disabled: boolean;
  onSave: (next: PaymentStatus) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <span className="flex items-center gap-1">
      <select
        value={entry.paymentStatus}
        disabled={disabled || saving}
        aria-label={`Payment status for ${name}`}
        title={`Payment status for ${name}`}
        className="h-8 w-auto text-[12px]"
        onChange={async (e) => {
          const next = e.target.value as PaymentStatus;
          setSaving(true);
          try {
            await onSave(next);
          } catch {
            // The screen owns the message; the adapter has already put the old value back.
          } finally {
            setSaving(false);
          }
        }}
      >
        {PAYMENT_OPTIONS.map((status) => (
          <option key={status} value={status}>
            {PAYMENT_LABEL[status]}
          </option>
        ))}
      </select>
      {saving && <span className="hint">Saving…</span>}
    </span>
  );
}
