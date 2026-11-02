"use client";

import { BadgeCheck, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { OverrideReadyInput } from "@/lib/data/adapters";
import type {
  DeskRegistration,
  PlayerRecord,
  RegistrationEntry,
  Tournament,
} from "@/lib/data/types";
import { ageOn, playingHandicap, type Tee } from "@/lib/routing";
import { matchFlights } from "@/lib/routing/classify";

const INDEX_MIN = -10;
const INDEX_MAX = 54;

export function ReadyOverrideDialog({
  open,
  onOpenChange,
  player,
  entry,
  registration,
  tournament,
  tees,
  latestIndex,
  latestIndexDate,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: PlayerRecord;
  entry: RegistrationEntry;
  registration: DeskRegistration;
  tournament: Tournament;
  tees: Tee[];
  latestIndex: number | null;
  latestIndexDate: string | null;
  onSave: (input: OverrideReadyInput) => void;
}) {
  const [index, setIndex] = useState(
    latestIndex !== null
      ? String(latestIndex)
      : registration.frozenIndex !== null
        ? String(registration.frozenIndex)
        : "",
  );
  const [birthdate, setBirthdate] = useState(player.birthdate ?? "");
  const [categoryId, setCategoryId] = useState(registration.categoryId ?? "");
  const [flightId, setFlightId] = useState(registration.flightId ?? "");
  const [reason, setReason] = useState("");

  const indexValue = index.trim() === "" ? null : Number(index);
  const indexValid =
    indexValue !== null &&
    Number.isFinite(indexValue) &&
    indexValue >= INDEX_MIN &&
    indexValue <= INDEX_MAX;
  const overLimit = indexValue !== null && indexValid && indexValue > tournament.config.maxIndex;
  const age = birthdate ? ageOn(birthdate, tournament.config.date) : null;
  const category = tournament.categories.find((item) => item.id === categoryId) ?? null;
  const tee = category ? (tees.find((item) => item.id === category.teeId) ?? null) : null;
  const playing =
    indexValue !== null && indexValid && tee
      ? playingHandicap(indexValue, tee, tournament.config.allowance)
      : null;
  const flightOptions = tournament.flights.filter((item) => item.categoryId === categoryId);
  const matchingFlights = useMemo(() => {
    if (indexValue === null || !indexValid || !category || playing === null) return [];
    const value = tournament.config.flightBasis === "index" ? indexValue : playing;
    return matchFlights(tournament.flights, category.id, value);
  }, [
    category,
    indexValid,
    indexValue,
    playing,
    tournament.config.flightBasis,
    tournament.flights,
  ]);
  const flight = flightOptions.find((item) => item.id === flightId) ?? null;
  const flaggedReasons =
    registration.reasons.length > 0 ? registration.reasons : (entry.reasons ?? []);

  const pending = [
    !player.gender ? "Gender is still missing; the category was chosen by the organizer." : null,
    !player.ngapId ? "NGAP ID is still missing." : null,
  ].filter((note): note is string => note !== null);

  const canSave =
    open &&
    indexValid &&
    !overLimit &&
    birthdate !== "" &&
    age !== null &&
    category !== null &&
    tee !== null &&
    flight !== null &&
    playing !== null &&
    reason.trim().length >= 3;

  function submit() {
    if (!canSave || indexValue === null || category === null || tee === null || playing === null) {
      return;
    }
    onSave({
      index: indexValue,
      // The organizer's index is the one used for this event. Keep the record date when one was
      // supplied; otherwise the override is dated today.
      effectiveDate: latestIndexDate ?? new Date().toISOString().slice(0, 10),
      birthdate,
      categoryId: category.id,
      teeId: tee.id,
      flightId,
      playingHandicap: playing,
      reason: reason.trim(),
      pending,
    });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Mark player ready"
        description={`${player.name} · ${tournament.name}`}
        className="w-[min(520px,calc(100vw-24px))]"
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="notice warn" role="note">
            <p className="m-0 text-[13px]">
              <b>Only the handicap index and the age are required to draft this player.</b> The
              category, tee and flight are recorded by hand because the profile is incomplete. Other
              missing details stay marked as pending and can be filled later.
            </p>
          </div>

          {flaggedReasons.length > 0 && (
            <div className="grid gap-1 rounded-[12px] border border-line bg-surface-sunken p-3">
              <span className="overline !text-[10px]">Why the desk flagged this entry</span>
              <ul className="plain m-0 grid gap-1 text-[13px]">
                {flaggedReasons.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          <label className="field">
            <span>Handicap index (latest)</span>
            <input
              type="number"
              step="0.1"
              min={INDEX_MIN}
              max={INDEX_MAX}
              value={index}
              onChange={(event) => setIndex(event.target.value)}
              aria-label="Handicap index"
              required
            />
            <span className="hint">
              The event uses this index.{" "}
              {latestIndexDate ? `Latest record: ${latestIndexDate}.` : ""}
            </span>
          </label>

          <label className="field">
            <span>Birthdate (age on the first day)</span>
            <input
              type="date"
              value={birthdate}
              onChange={(event) => setBirthdate(event.target.value)}
              aria-label="Birthdate"
              required
            />
            <span className="hint">{age === null ? "Enter a valid date." : `Age ${age}.`}</span>
          </label>

          <label className="field">
            <span>Category and tee</span>
            <select
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setFlightId("");
              }}
              aria-label="Category"
              required
            >
              <option value="">Choose a category</option>
              {tournament.categories.map((item) => {
                const itemTee = tees.find((candidate) => candidate.id === item.teeId);
                return (
                  <option key={item.id} value={item.id}>
                    {item.name} ·{" "}
                    {item.gender === "any" ? "everyone" : item.gender === "M" ? "men" : "women"} ·{" "}
                    {item.minAge}-{item.maxAge ?? "no limit"} · {itemTee?.name ?? "no tee"}
                  </option>
                );
              })}
            </select>
            <span className="hint">
              {tee ? `Tee: ${tee.name}` : "Choose the category the player belongs to."}
            </span>
          </label>

          <label className="field">
            <span>Flight</span>
            <select
              value={flightId}
              onChange={(event) => setFlightId(event.target.value)}
              aria-label="Flight"
              required
              disabled={!categoryId}
            >
              <option value="">Choose a flight</option>
              {flightOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.min} to {item.max}
                </option>
              ))}
            </select>
            <span className="hint">
              {matchingFlights.length === 1
                ? `The index falls in ${matchingFlights[0]?.name}.`
                : matchingFlights.length > 1
                  ? "The flight ranges overlap; choose the one the organizer confirmed."
                  : "No flight matches this index automatically."}
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3 rounded-[12px] bg-surface-sunken p-3 text-[13px]">
            <div>
              <span className="overline !text-[10px]">Playing handicap</span>
              <b className="block font-display text-xl">{playing ?? "—"}</b>
            </div>
            <div>
              <span className="overline !text-[10px]">Age</span>
              <b className="block font-display text-xl">{age ?? "—"}</b>
            </div>
          </div>

          {overLimit && (
            <p className="notice bad flex items-start gap-2 text-[13px]" role="alert">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              This index is above the event limit of {tournament.config.maxIndex}. Correct the index
              instead of overriding the entry.
            </p>
          )}

          <label className="field">
            <span>Reason for the override (required)</span>
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is this player being marked ready?"
              aria-label="Override reason"
              required
            />
          </label>

          {pending.length > 0 && (
            <div className="hint">Still pending after this save: {pending.join(" ")}</div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!canSave}>
              <BadgeCheck aria-hidden="true" />
              Mark ready
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
