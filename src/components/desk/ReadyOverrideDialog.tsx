"use client";

import { BadgeCheck, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { OverrideReadyInput } from "@/lib/data/adapters";
import { overrideTee } from "@/lib/data/registrations";
import type {
  DeskRegistration,
  PlayerRecord,
  RegistrationEntry,
  Tournament,
} from "@/lib/data/types";
import { ageOn, playingHandicap, type Tee } from "@/lib/routing";
import { matchFlights, teamClassValue } from "@/lib/routing/classify";

const INDEX_MIN = -10;
const INDEX_MAX = 54;
/** The largest committee adjustment the desk accepts, in strokes either way. */
const ADJUSTMENT_MAX = 10;

/**
 * Marks a needs-review entry ready.
 *
 * A guest often never sends an age, a class or an NGAP record. The draw no longer waits for those
 * facts: whatever the desk knows is stored, the rest is listed as pending on the registration, and
 * an entry without a category and flight plays in an Unclassified group until it is corrected.
 */
export function ReadyOverrideDialog({
  open,
  onOpenChange,
  player,
  entry,
  registration,
  tournament,
  tees,
  cutOffDate,
  cutOffIndex,
  cutOffIndexDate,
  newerIndexDate,
  partnerEntry = null,
  partnerRegistration = null,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: PlayerRecord;
  entry: RegistrationEntry;
  registration: DeskRegistration;
  tournament: Tournament;
  tees: Tee[];
  /** The event's cut-off date, so the hint can name it. */
  cutOffDate: string | null;
  /** The index on the cut-off day, from the last NGAP record on or before it. */
  cutOffIndex: number | null;
  /** The effective date of that record. */
  cutOffIndexDate: string | null;
  /** A record dated after the cut-off. Shown as a note; the event never uses it. */
  newerIndexDate: string | null;
  /**
   * The other entry of the player's pair, when the club paired them. The class is cut on both
   * partners, so the save writes it to both rows.
   */
  partnerEntry?: RegistrationEntry | null;
  /** That partner's registration, for the index and playing handicap the pair is classed on. */
  partnerRegistration?: DeskRegistration | null;
  onSave: (input: OverrideReadyInput) => void;
}) {
  // A ready entry is being corrected, so the dialog starts from the index the event uses now. An
  // entry in review starts from the cut-off record, as before.
  const editing = registration.status !== "needs_review";
  const [index, setIndex] = useState(
    editing && registration.frozenIndex !== null
      ? String(registration.frozenIndex)
      : cutOffIndex !== null
        ? String(cutOffIndex)
        : registration.frozenIndex !== null
          ? String(registration.frozenIndex)
          : "",
  );
  const [flightTouched, setFlightTouched] = useState(false);
  const [birthdate, setBirthdate] = useState(player.birthdate ?? "");
  const [categoryId, setCategoryId] = useState(registration.categoryId ?? "");
  const [flightId, setFlightId] = useState(registration.flightId ?? "");
  const [adjustment, setAdjustment] = useState("");
  const [reason, setReason] = useState("");

  // Blank is a real answer here: a player with no NGAP record still plays today.
  const indexValue = index.trim() === "" ? null : Number(index);
  const indexValid =
    indexValue === null ||
    (Number.isFinite(indexValue) && indexValue >= INDEX_MIN && indexValue <= INDEX_MAX);
  const overLimit = indexValue !== null && indexValid && indexValue > tournament.config.maxIndex;
  // The event caps an index above its maximum. The index is kept as entered, and the class and the
  // playing handicap are worked out from the capped number, exactly as the draw does.
  const cappedIndex =
    indexValue === null || !indexValid ? null : Math.min(indexValue, tournament.config.maxIndex);
  const age = birthdate ? ageOn(birthdate, tournament.config.date) : null;
  const category = tournament.categories.find((item) => item.id === categoryId) ?? null;
  // The tee the category carries is only the fallback. The registration's own tee, set from the
  // paper cards, is the one the event scores with, so it wins here and it is what the save sends.
  const tee = overrideTee(
    {
      entryTeeId: entry.teeId,
      registrationTeeId: registration.teeId,
      categoryTeeId: category?.teeId,
    },
    tees,
  );
  const teeFromRegistration = Boolean(entry.teeId || registration.teeId);
  const playing =
    cappedIndex !== null && tee
      ? playingHandicap(cappedIndex, tee, tournament.config.allowance, tournament.config.maxIndex)
      : null;
  // The conditions of play let the committee adjust a course handicap. The adjustment is strokes on
  // the computed number, and it is stored with the reason below.
  const adjustmentValue = adjustment.trim() === "" ? 0 : Number(adjustment);
  const adjustmentValid =
    Number.isInteger(adjustmentValue) && Math.abs(adjustmentValue) <= ADJUSTMENT_MAX;
  const adjusted = playing === null ? null : playing + adjustmentValue;
  // A pair is classed on both partners, not on the player whose index changed: the average of the
  // two numbers in the event's basis, with an index above the maximum counted as the maximum. An
  // unpaired player is classed on their own number, which is the same rule with one member.
  const paired = partnerEntry !== null;
  const pairValue = teamClassValue(
    paired
      ? [
          { index: indexValue, playingHandicap: adjusted },
          {
            // The partner's registration carries the number the draw uses. Its entry is the fallback
            // when the row cannot be built, so a pair is never classed on half its number.
            index: partnerRegistration?.frozenIndex ?? partnerEntry?.frozen.index ?? null,
            playingHandicap: partnerRegistration?.playingHandicap ?? null,
          },
        ]
      : [{ index: indexValue, playingHandicap: adjusted }],
    tournament.config.flightBasis,
    tournament.config.maxIndex,
  );
  const basisLabel =
    tournament.config.flightBasis === "courseHandicap" ? "course handicap" : "index";
  // Classes are cut over the whole field; the category a flight row hangs off is storage only.
  const flightOptions = tournament.flights;
  const matchingFlights = useMemo(() => {
    if (indexValue === null || !indexValid || !category || playing === null) return [];
    return matchFlights(tournament.flights, pairValue);
  }, [category, indexValid, indexValue, pairValue, playing, tournament.flights]);
  // Until the desk picks a flight by hand, a new index moves the player into the one flight it
  // falls in, so correcting the index also corrects the class.
  const autoFlight =
    !flightTouched && matchingFlights.length === 1
      ? (flightOptions.find((item) => item.id === matchingFlights[0]?.id) ?? null)
      : null;
  const flight = autoFlight ?? flightOptions.find((item) => item.id === flightId) ?? null;
  const flaggedReasons =
    registration.reasons.length > 0 ? registration.reasons : (entry.reasons ?? []);

  // Everything the draw still has to collect. Listed here so the desk sees what to fill in later,
  // and stored on the registration when the override is saved.
  const pending = [
    birthdate === "" ? "Birthdate is still missing, so the player has no age on file." : null,
    !player.gender ? "Gender is still missing; the category was chosen by the organizer." : null,
    category === null
      ? "Category and tee are not set, so the player plays in an Unclassified group."
      : flight === null
        ? "Flight is not set, so the player plays in an Unclassified group."
        : null,
    !player.ngapId ? "NGAP ID is still missing." : null,
  ].filter((note): note is string => note !== null);

  // Only the reason is required: it is the only thing the desk must supply, and it is what makes
  // an incomplete entry auditable. An index, when entered, has to be usable.
  const canSave = open && indexValid && adjustmentValid && reason.trim().length >= 3;

  // The record's date belongs only to its own index. An index the desk types in is not in that
  // record, so it is dated today rather than borrowing a date it never had.
  const effectiveDate =
    indexValue === null
      ? null
      : indexValue === cutOffIndex && cutOffIndexDate
        ? cutOffIndexDate
        : today();

  function submit() {
    if (!canSave) return;
    onSave({
      index: indexValue,
      effectiveDate,
      birthdate: birthdate === "" ? null : birthdate,
      categoryId: category?.id ?? null,
      // The same tee the playing handicap above was worked out on. Sending the category's tee here
      // would put it back over the tee the registration was corrected to from the paper cards.
      teeId: tee?.id ?? registration.teeId ?? null,
      flightId: flight?.id ?? null,
      playingHandicap: adjusted,
      // A pair is stored on both rows, so neither partner is left in an old class after a reload
      // or a redraw. Only the class is copied: the partner is not an override of its own.
      partnerEntryId: partnerEntry?.id ?? null,
      pairFlightId: paired ? (flight?.id ?? null) : null,
      reason: reason.trim(),
      pending,
    });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={editing ? "Edit index and class" : "Mark player ready"}
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
              {editing ? (
                <>
                  <b>Correct the index this event uses.</b> The playing handicap is worked out again
                  from the capped index and the class follows{" "}
                  {paired ? "the average of both partners" : "the new index"} unless you choose one.
                  Redraw or move the player on the board if the group should change too.
                </>
              ) : (
                <>
                  <b>Record what you know and mark the player ready.</b> A guest with no age,
                  category or flight still plays today: the entry goes into an <b>Unclassified</b>{" "}
                  group, and whatever is missing is listed on it so the desk can fill it in later.
                  An NGAP index is used when one is entered.
                </>
              )}
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
            <span>{editing ? "Handicap index for this event" : "Handicap index at cut-off"}</span>
            <input
              type="number"
              step="0.1"
              min={INDEX_MIN}
              max={INDEX_MAX}
              value={index}
              onChange={(event) => setIndex(event.target.value)}
              aria-label="Handicap index"
            />
            <span className="hint">
              {cutOffIndex === null
                ? cutOffDate
                  ? `No NGAP record on or before the cut-off (${cutOffDate}). Leave it blank when there is none yet: the player still plays today.`
                  : "Leave it blank when there is no NGAP record yet. The player still plays today."
                : editing
                  ? `The event uses this index now. The NGAP record on or before the cut-off${cutOffDate ? ` (${cutOffDate})` : ""} says ${cutOffIndex}.`
                  : `The index the event accepts: the NGAP record dated ${cutOffIndexDate}, the last one on or before the cut-off${cutOffDate ? ` (${cutOffDate})` : ""}.`}
              {newerIndexDate
                ? ` A later record dated ${newerIndexDate} is not used for this event.`
                : ""}
            </span>
          </label>

          <label className="field">
            <span>Birthdate (age on the first day)</span>
            <input
              type="date"
              value={birthdate}
              onChange={(event) => setBirthdate(event.target.value)}
              aria-label="Birthdate"
            />
            <span className="hint">
              {birthdate === ""
                ? "Leave it blank if the player has not sent it. A date that is not valid is ignored."
                : age === null
                  ? "Enter a valid date."
                  : `Age ${age}.`}
            </span>
          </label>

          <label className="field">
            <span>Category and tee</span>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              aria-label="Category"
            >
              <option value="">Not set yet (Unclassified)</option>
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
              {tee
                ? teeFromRegistration
                  ? `This entry plays the ${tee.name} tee, so the playing handicap uses it.`
                  : `No tee on the registration, so the category tee (${tee.name}) is used.`
                : categoryId === ""
                  ? "Leave it blank when the class is not known yet."
                  : teeFromRegistration
                    ? "The tee on this registration is not one of this event's tees, so the playing handicap cannot be worked out."
                    : "This category has no tee set up in Settings."}
            </span>
          </label>

          <label className="field">
            <span>Flight</span>
            <select
              value={flight?.id ?? flightId}
              onChange={(event) => {
                setFlightTouched(true);
                setFlightId(event.target.value);
              }}
              aria-label="Flight"
              disabled={!categoryId}
            >
              <option value="">Not set yet (Unclassified)</option>
              {flightOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.min} to {item.max}
                </option>
              ))}
            </select>
            <span className="hint">
              {!categoryId
                ? "Leave it blank until the category is known."
                : matchingFlights.length === 1
                  ? paired
                    ? `The pair's average ${basisLabel} is ${pairValue}, which falls in ${matchingFlights[0]?.name}.`
                    : `The ${basisLabel} is ${pairValue}, which falls in ${matchingFlights[0]?.name}.`
                  : matchingFlights.length > 1
                    ? "The flight ranges overlap; choose the one the organizer confirmed."
                    : paired
                      ? `No flight matches the pair's average ${basisLabel} of ${pairValue}.`
                      : `No flight matches ${basisLabel} ${pairValue} automatically.`}
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3 rounded-[12px] bg-surface-sunken p-3 text-[13px]">
            <div>
              <span className="overline !text-[10px]">Playing handicap</span>
              <b className="block font-display text-xl">{adjusted ?? "—"}</b>
              {tee ? (
                <span className="hint block">on the {tee.name} tee</span>
              ) : (
                <span className="hint block">No tee set for this entry yet.</span>
              )}
              {adjusted !== null && adjustmentValue !== 0 && (
                <span className="hint block">
                  Computed {playing}, adjusted by {adjustmentValue > 0 ? "+" : ""}
                  {adjustmentValue}.
                </span>
              )}
            </div>
            <div>
              <span className="overline !text-[10px]">Age</span>
              <b className="block font-display text-xl">{age ?? "—"}</b>
            </div>
          </div>

          {paired && partnerRegistration && (
            <p className="hint">
              Paired with <b>{partnerRegistration.playerName}</b>. The class is cut on both
              partners&apos; average {basisLabel} of {pairValue} and is saved on both entries.
            </p>
          )}

          {overLimit && (
            <p className="notice warn flex items-start gap-2 text-[13px]" role="status">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              This index is above the event limit of {tournament.config.maxIndex}. The class and the
              playing handicap use {tournament.config.maxIndex}; the index entered is kept on file.
            </p>
          )}

          <label className="field">
            <span>Committee adjustment (strokes)</span>
            <input
              type="number"
              step="1"
              min={-ADJUSTMENT_MAX}
              max={ADJUSTMENT_MAX}
              value={adjustment}
              onChange={(event) => setAdjustment(event.target.value)}
              aria-label="Committee adjustment"
            />
            <span className="hint">
              {indexValue === null
                ? "Set the index first; an adjustment only changes a computed number."
                : adjustmentValid
                  ? "Leave it blank for the computed course handicap. The conditions of play let the committee adjust a handicap; the reason below records why."
                  : `Use whole strokes, at most ${ADJUSTMENT_MAX} either way.`}
            </span>
          </label>

          <label className="field">
            <span>Reason for the override (required)</span>
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                editing
                  ? "Why is the index being changed?"
                  : "Why is this player being marked ready?"
              }
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
              {editing ? "Save index" : "Mark ready"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Today in the ISO form the database stores. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
