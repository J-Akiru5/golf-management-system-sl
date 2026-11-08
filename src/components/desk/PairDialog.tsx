"use client";

import {
  ArrowLeftRight,
  ArrowRightLeft,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { SavePairInput, SwapPairInput } from "@/lib/data/adapters";
import type { PlayerRecord, RegistrationEntry } from "@/lib/data/types";
import { fmtHcp, fmtIndex } from "@/lib/format";
import {
  nextPairNumber,
  type PairSide,
  pairProblems,
  pairSlots,
  partnerCandidates,
} from "@/lib/pairs/pairs";

export interface PairDialogTarget {
  number: number;
  side: PairSide;
  /** The player whose pair is being managed, or null when filling an empty slot. */
  entryId: string | null;
  start: "menu" | "assign" | "create";
}

type Step = "menu" | "assign" | "replace" | "move" | "swap" | "remove" | "create";

export interface PairDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PairDialogTarget;
  tournamentId: string;
  entries: readonly RegistrationEntry[];
  players: readonly PlayerRecord[];
  onSave: (input: SavePairInput) => Promise<void>;
  onSwap: (input: SwapPairInput) => Promise<void>;
}

const SIDE_WORD: Record<PairSide, string> = { member: "member", guest: "guest" };

/**
 * One member-guest pair, changed in one place. The same drawer is opened from the registration
 * desk, the player workspace and the pair page, so the three screens cannot disagree about the
 * rules or produce a different write.
 */
export function PairDialog({
  open,
  onOpenChange,
  target,
  tournamentId,
  entries,
  players,
  onSave,
  onSwap,
}: PairDialogProps) {
  const [step, setStep] = useState<Step>(
    target.start === "create" ? "create" : target.start === "assign" ? "assign" : "menu",
  );
  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [moveNumber, setMoveNumber] = useState<string>("");
  const [swapNumber, setSwapNumber] = useState<string>("");
  const [newNumber, setNewNumber] = useState(String(target.number));
  const [createMember, setCreateMember] = useState("");
  const [createGuest, setCreateGuest] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(target.start === "create" ? "create" : target.start === "assign" ? "assign" : "menu");
    setSearch("");
    setPickedId(null);
    setMoveNumber("");
    setSwapNumber("");
    setNewNumber(String(target.number));
    setCreateMember("");
    setCreateGuest("");
    setReason("");
    setBusy(false);
    setError("");
    // The target is rebuilt by the page on every render; only its values decide a reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target.number, target.side, target.entryId, target.start]);

  const slots = useMemo(() => pairSlots(entries, target.number), [entries, target.number]);
  const otherSide: PairSide = target.side === "member" ? "guest" : "member";
  const otherEntry = slots[otherSide];
  const targetEntry = target.entryId
    ? (entries.find((entry) => entry.id === target.entryId) ?? null)
    : null;
  // A solo player has no pair yet. The drawer then creates the pair around them instead of
  // pretending they already fill one of its slots.
  const targetInPair =
    target.entryId !== null &&
    (slots.member?.id === target.entryId || slots.guest?.id === target.entryId);
  const creatingWithTarget = targetEntry !== null && !targetInPair;

  const playerOf = (entry: RegistrationEntry | null): PlayerRecord | null =>
    entry ? (players.find((player) => player.id === entry.playerId) ?? null) : null;

  const nameOf = (entry: RegistrationEntry | null): string => {
    const player = playerOf(entry);
    return player?.name ?? "Unknown player";
  };

  const metaOf = (entry: RegistrationEntry | null): string => {
    const player = playerOf(entry);
    if (!player) return "";
    const registration = entry;
    return [
      player.homeCourse || null,
      registration?.playingHandicap !== null && registration?.playingHandicap !== undefined
        ? `PH ${fmtHcp(registration.playingHandicap)}`
        : null,
      registration?.frozen.index !== null && registration?.frozen.index !== undefined
        ? `Index ${fmtIndex(registration.frozen.index)}`
        : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" · ");
  };

  const candidates = useMemo(() => {
    const side = step === "replace" || creatingWithTarget ? otherSide : target.side;
    const exclude =
      step === "replace"
        ? (otherEntry?.id ?? null)
        : step === "assign"
          ? (targetEntry?.id ?? null)
          : null;
    const list = partnerCandidates(entries, side, {
      excludeEntryId: exclude,
      pairNumber: creatingWithTarget ? null : target.number,
    });
    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter((entry) => {
      const player = players.find((candidate) => candidate.id === entry.playerId);
      return (
        (player?.name ?? "").toLowerCase().includes(query) ||
        (player?.ngapId ?? "").toLowerCase().includes(query)
      );
    });
  }, [
    entries,
    players,
    step,
    target.side,
    target.number,
    targetEntry?.id,
    otherEntry?.id,
    creatingWithTarget,
    search,
  ]);

  const pairNumbers = useMemo(() => {
    const numbers = new Set<number>();
    for (const entry of entries) {
      if (typeof entry.teamNo === "number") numbers.add(entry.teamNo);
    }
    return [...numbers].sort((a, b) => a - b);
  }, [entries]);

  const moveTargets = useMemo(
    () =>
      pairNumbers.filter(
        (number) =>
          number !== target.number &&
          !entries.some((entry) => entry.teamNo === number && entry.role === target.side),
      ),
    [entries, pairNumbers, target.number, target.side],
  );

  const swapTargets = useMemo(
    () =>
      pairNumbers.filter(
        (number) =>
          number !== target.number &&
          entries.some((entry) => entry.teamNo === number && entry.role === target.side),
      ),
    [entries, pairNumbers, target.number, target.side],
  );

  const unpaired = (side: PairSide) => partnerCandidates(entries, side);

  const describeSlots = (memberId: string | null, guestId: string | null) => {
    const member = entries.find((entry) => entry.id === memberId) ?? null;
    const guest = entries.find((entry) => entry.id === guestId) ?? null;
    return [
      `Member: ${member ? nameOf(member) : "empty"}`,
      `Guest: ${guest ? nameOf(guest) : "empty"}`,
    ].join(" · ");
  };

  const run = async (work: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await work();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The pair was not saved.");
    } finally {
      setBusy(false);
    }
  };

  const save = (
    action: NonNullable<SavePairInput["action"]>,
    number: number,
    memberEntryId: string | null,
    guestEntryId: string | null,
  ) =>
    run(() =>
      onSave({
        tournamentId,
        number,
        memberEntryId,
        guestEntryId,
        action,
        reason: reason.trim() || null,
      }),
    );

  const assignPicked = () => {
    if (!pickedId) return;
    if (creatingWithTarget) {
      const memberEntryId = target.side === "member" ? target.entryId : pickedId;
      const guestEntryId = target.side === "guest" ? target.entryId : pickedId;
      void save("pair.assign", target.number, memberEntryId, guestEntryId);
      return;
    }
    const side = step === "replace" ? otherSide : target.side;
    const memberEntryId =
      side === "member"
        ? pickedId
        : ((step === "replace" ? targetEntry?.id : slots.member?.id) ?? null);
    const guestEntryId =
      side === "guest"
        ? pickedId
        : ((step === "replace" ? targetEntry?.id : slots.guest?.id) ?? null);
    void save(
      step === "replace" ? "pair.replace" : "pair.assign",
      target.number,
      memberEntryId,
      guestEntryId,
    );
  };

  const moveTo = async () => {
    if (!targetEntry) return;
    const number = moveNumber === "new" ? nextPairNumber(entries) : Number(moveNumber);
    if (!Number.isInteger(number) || number < 1) {
      setError("Choose a pair or a new pair number.");
      return;
    }
    const destination =
      moveNumber === "new" ? { member: null, guest: null } : pairSlots(entries, number);
    const memberEntryId =
      target.side === "member" ? targetEntry.id : (destination.member?.id ?? null);
    const guestEntryId = target.side === "guest" ? targetEntry.id : (destination.guest?.id ?? null);
    // The moved player is still recorded in the current pair, so the "already paired" check does
    // not apply here. The database moves the row anyway.
    await save("pair.move", number, memberEntryId, guestEntryId);
  };

  const swapWith = () => {
    const number = Number(swapNumber);
    if (!Number.isInteger(number) || number < 1) {
      setError("Choose a pair to swap with.");
      return;
    }
    void run(() =>
      onSwap({
        tournamentId,
        numberA: target.number,
        numberB: number,
        side: target.side,
        reason: reason.trim() || null,
      }),
    );
  };

  const createPair = () => {
    const number = Number(newNumber);
    const problems = pairProblems({
      entries,
      number,
      memberEntryId: createMember || null,
      guestEntryId: createGuest || null,
      creating: true,
    });
    if (problems.length > 0) {
      setError(problems[0]?.message ?? "That pair cannot be created.");
      return;
    }
    void save("pair.create", number, createMember || null, createGuest || null);
  };

  const remove = () => {
    if (!targetEntry) return;
    const memberEntryId = target.side === "member" ? null : (slots.member?.id ?? null);
    const guestEntryId = target.side === "guest" ? null : (slots.guest?.id ?? null);
    void save("pair.remove", target.number, memberEntryId, guestEntryId);
  };

  const title = step === "create" ? "Pair two players" : `Pair ${target.number}`;
  const description =
    step === "create"
      ? "Both players must be entered and unpaired in this event."
      : creatingWithTarget
        ? `A new pair ${target.number} will be created with ${nameOf(targetEntry)} and a partner.`
        : describeSlots(slots.member?.id ?? null, slots.guest?.id ?? null);

  const candidateSide = step === "replace" || creatingWithTarget ? otherSide : target.side;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={title} description={description}>
        {error && (
          <div className="notice bad text-[13px]" role="alert">
            {error}
          </div>
        )}

        {step === "menu" && (
          <div className="grid gap-2">
            {(otherEntry === null || !targetInPair) && (
              <ActionRow
                icon={<UserPlus className="size-4" aria-hidden="true" />}
                title="Assign partner"
                detail={
                  creatingWithTarget
                    ? `Create pair ${target.number} with ${nameOf(targetEntry)} and a partner.`
                    : `Fill the empty ${SIDE_WORD[otherSide]} slot.`
                }
                onClick={() => setStep("assign")}
              />
            )}
            {otherEntry !== null && targetEntry !== null && targetInPair && (
              <ActionRow
                icon={<ArrowRightLeft className="size-4" aria-hidden="true" />}
                title="Replace partner"
                detail={`Keep ${nameOf(targetEntry)} and change the ${SIDE_WORD[otherSide]}.`}
                onClick={() => setStep("replace")}
              />
            )}
            {targetEntry && (
              <ActionRow
                icon={<ArrowLeftRight className="size-4" aria-hidden="true" />}
                title="Move to another pair"
                detail={`Take ${nameOf(targetEntry)} out of pair ${target.number}.`}
                onClick={() => setStep("move")}
              />
            )}
            {targetEntry && targetInPair && swapTargets.length > 0 && (
              <ActionRow
                icon={<Users className="size-4" aria-hidden="true" />}
                title="Swap with another pair"
                detail={`Exchange ${nameOf(targetEntry)} with a ${SIDE_WORD[target.side]} in another pair.`}
                onClick={() => setStep("swap")}
              />
            )}
            {targetEntry && targetInPair && (
              <ActionRow
                icon={<UserMinus className="size-4" aria-hidden="true" />}
                title="Remove from pair"
                detail={`${nameOf(targetEntry)} stays in the event and becomes solo.`}
                onClick={() => setStep("remove")}
              />
            )}
            <ActionRow
              icon={<Users className="size-4" aria-hidden="true" />}
              title="Pair two solo players"
              detail="Create a new pair from two players who are not paired."
              onClick={() => setStep("create")}
            />
          </div>
        )}

        {(step === "assign" || step === "replace") && (
          <div className="grid gap-3">
            <label className="field">
              <span className="sr-only">Search players</span>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
                  aria-hidden="true"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={`Search ${SIDE_WORD[candidateSide]}s`}
                  className="pl-9"
                  autoFocus
                />
              </div>
            </label>
            <div className="grid max-h-[45vh] gap-1.5 overflow-y-auto pr-1">
              {candidates.length === 0 && (
                <p className="hint">
                  No unpaired {SIDE_WORD[candidateSide]} is left in this event. Add the player to
                  the event first, then come back here.
                </p>
              )}
              {candidates.map((entry) => {
                const player = playerOf(entry);
                const isPicked = pickedId === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setPickedId(entry.id)}
                    aria-pressed={isPicked}
                    className={`flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2 text-left ${
                      isPicked
                        ? "border-fairway bg-surface-sunken"
                        : "border-line hover:bg-surface-sunken"
                    }`}
                  >
                    <span className="min-w-0">
                      <b className="block truncate text-[14px]">
                        {player?.name ?? "Unknown player"}
                      </b>
                      <span className="hint block truncate">{metaOf(entry)}</span>
                    </span>
                    {entry.teamNo != null && <span className="pill">Pair {entry.teamNo}</span>}
                  </button>
                );
              })}
            </div>
            <label className="field">
              <span>Reason (optional)</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why the pair changed"
              />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="primary" disabled={!pickedId || busy} onClick={assignPicked}>
                {busy ? "Saving…" : step === "replace" ? "Replace partner" : "Assign partner"}
              </Button>
              <Button variant="ghost" onClick={() => setStep("menu")} disabled={busy}>
                Back
              </Button>
            </div>
          </div>
        )}

        {step === "move" && targetEntry && (
          <div className="grid gap-3">
            <p className="hint">
              {nameOf(targetEntry)} leaves pair {target.number}. The pair keeps its{" "}
              {SIDE_WORD[target.side === "member" ? "guest" : "member"]} slot if one is filled.
            </p>
            <label className="field">
              <span>Move to</span>
              <select value={moveNumber} onChange={(event) => setMoveNumber(event.target.value)}>
                <option value="">Choose a pair</option>
                <option value="new">New pair · {nextPairNumber(entries)}</option>
                {moveTargets.map((number) => (
                  <option key={number} value={number}>
                    Pair {number} · {SIDE_WORD[target.side]} slot open
                  </option>
                ))}
              </select>
            </label>
            {moveNumber && moveNumber !== "new" && (
              <p className="hint">
                {describeSlots(
                  pairSlots(entries, Number(moveNumber)).member?.id ?? null,
                  pairSlots(entries, Number(moveNumber)).guest?.id ?? null,
                )}
              </p>
            )}
            <label className="field">
              <span>Reason (optional)</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why the pair changed"
              />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="primary"
                disabled={!moveNumber || busy}
                onClick={() => void moveTo()}
              >
                {busy ? "Saving…" : "Move player"}
              </Button>
              <Button variant="ghost" onClick={() => setStep("menu")} disabled={busy}>
                Back
              </Button>
            </div>
          </div>
        )}

        {step === "swap" && targetEntry && (
          <div className="grid gap-3">
            <p className="hint">
              {nameOf(targetEntry)} swaps places with the {SIDE_WORD[target.side]} in another pair.
              Both players stay in the event.
            </p>
            <label className="field">
              <span>Swap with</span>
              <select value={swapNumber} onChange={(event) => setSwapNumber(event.target.value)}>
                <option value="">Choose a pair</option>
                {swapTargets.map((number) => (
                  <option key={number} value={number}>
                    Pair {number} ·{" "}
                    {nameOf(
                      entries.find(
                        (entry) => entry.teamNo === number && entry.role === target.side,
                      ) ?? null,
                    )}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Reason (optional)</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why the pair changed"
              />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="primary" disabled={!swapNumber || busy} onClick={swapWith}>
                {busy ? "Saving…" : "Swap partners"}
              </Button>
              <Button variant="ghost" onClick={() => setStep("menu")} disabled={busy}>
                Back
              </Button>
            </div>
          </div>
        )}

        {step === "remove" && targetEntry && (
          <div className="grid gap-3">
            <p>
              Remove <b>{nameOf(targetEntry)}</b> from pair {target.number}? The player stays in the
              event and can be paired again later.
            </p>
            <label className="field">
              <span>Reason (optional)</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why the pair changed"
              />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="danger" disabled={busy} onClick={remove}>
                <Trash2 aria-hidden="true" /> {busy ? "Removing…" : "Remove from pair"}
              </Button>
              <Button variant="ghost" onClick={() => setStep("menu")} disabled={busy}>
                Keep the pair
              </Button>
            </div>
          </div>
        )}

        {step === "create" && (
          <div className="grid gap-3">
            <label className="field">
              <span>Pair number</span>
              <input
                type="number"
                min={1}
                value={newNumber}
                onChange={(event) => setNewNumber(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Member</span>
              <select
                value={createMember}
                onChange={(event) => setCreateMember(event.target.value)}
              >
                <option value="">Choose a member</option>
                {unpaired("member").map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {nameOf(entry)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Guest</span>
              <select value={createGuest} onChange={(event) => setCreateGuest(event.target.value)}>
                <option value="">Choose a guest</option>
                {unpaired("guest").map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {nameOf(entry)}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">{describeSlots(createMember || null, createGuest || null)}</p>
            <label className="field">
              <span>Reason (optional)</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why the pair changed"
              />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="primary"
                disabled={(!createMember && !createGuest) || busy}
                onClick={createPair}
              >
                {busy ? "Saving…" : "Create pair"}
              </Button>
              <Button variant="ghost" onClick={() => setStep("menu")} disabled={busy}>
                Back
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ActionRow({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-[10px] border border-line px-3 py-2.5 text-left hover:bg-surface-sunken"
    >
      <span className="mt-0.5 text-fairway">{icon}</span>
      <span className="min-w-0">
        <b className="block text-[14px]">{title}</b>
        <span className="hint block">{detail}</span>
      </span>
    </button>
  );
}
