"use client";

import { ArrowRight, Phone } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArriveButton } from "@/components/staff/ArriveButton";
import { DayPills } from "@/components/staff/DayPills";
import { useStaffDay } from "@/components/staff/day-context";
import styles from "@/components/staff/staff.module.css";
import { useStaffRows } from "@/components/staff/use-rows";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { placementOf } from "@/lib/draw/withdraw";
import { fmtTime } from "@/lib/format";
import {
  type ArrivalFilter,
  FILTER_LABELS,
  filterRows,
  type StaffRow,
  summarise,
} from "@/lib/staff/rows";
import {
  clearWithdrawal,
  readWithdrawal,
  type WithdrawUndo,
  writeWithdrawal,
} from "@/lib/staff/withdraw";
import { useDesk } from "@/lib/store/desk-store";

const FILTERS: ArrivalFilter[] = ["not-arrived", "arrived", "needs-review", "all"];

/**
 * Players: the arrival list. A name, the group and tee the player should be at, and one button.
 * The sheet behind a name holds the contact number, the days they play and the two corrections a
 * volunteer is allowed to make: move a player to another group (manager only) or withdraw them
 * from today.
 */
export default function StaffPlayersPage() {
  const {
    tournament,
    entries,
    players,
    days: eventDays,
    adapters,
    dispatch,
    draw,
    member,
    names,
  } = useDesk();
  const { day, days, notice, setDayNumber } = useStaffDay();
  const { rows, schedule } = useStaffRows();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ArrivalFilter>("not-arrived");
  const [selected, setSelected] = useState<StaffRow | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveReason, setMoveReason] = useState("");
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [undoWithdraw, setUndoWithdraw] = useState<WithdrawUndo | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoError, setUndoError] = useState("");

  const counts = summarise(rows);
  const visible = useMemo(() => filterRows(rows, filter, query), [rows, filter, query]);
  const manager = !member || member.role === "owner" || member.role === "organizer";
  const entry = selected
    ? (entries.find((candidate) => candidate.id === selected.entryId) ?? null)
    : null;

  const dayChoices = useMemo(
    () =>
      Object.fromEntries(
        (entry?.selectedDays ?? []).map((number) => [
          number,
          eventDays.find((candidate) => candidate.dayNumber === number)?.label ?? `Day ${number}`,
        ]),
      ),
    [entry, eventDays],
  );

  const tournamentId = tournament?.id ?? null;
  const selectedDayNumber = day?.number ?? null;

  // The last withdrawal on this tab, so leaving Players to look at the group and coming back still
  // offers the undo. The token holds ids, not names; the player is looked up below.
  useEffect(() => {
    if (!tournamentId || selectedDayNumber === null) {
      setUndoWithdraw(null);
      return;
    }
    setUndoWithdraw(readWithdrawal(tournamentId, selectedDayNumber));
    setUndoError("");
  }, [tournamentId, selectedDayNumber]);

  function open(row: StaffRow) {
    setSelected(row);
    setMoving(false);
    setMoveReason("");
    setConfirmWithdraw(false);
    setSheetError("");
  }

  async function withdrawToday() {
    if (!entry || !day || !tournament) return;
    setBusy(true);
    setSheetError("");
    const placement = placementOf(draw ?? [], entry.playerId);
    try {
      const remaining = (entry.selectedDays ?? []).filter((number) => number !== day.number);
      const sessions = Object.fromEntries(
        Object.entries(entry.daySessions ?? {}).filter(([key]) => remaining.includes(Number(key))),
      ) as Record<number, "AM" | "PM">;
      await adapters.registrations.setDays(entry.id, remaining, sessions);
      // The board is a saved draw, not a view. Taking the player off it is what keeps the group
      // roster, the ticks and the player list telling the same story after the sheet closes.
      if (placement) dispatch({ type: "withdrawFromDraw", playerId: entry.playerId });
      const token: WithdrawUndo = {
        tournamentId: tournament.id,
        dayNumber: day.number,
        entryId: entry.id,
        playerId: entry.playerId,
        previousDays: entry.selectedDays ?? [],
        previousSessions: entry.daySessions ?? {},
        placement,
        at: new Date().toISOString(),
      };
      writeWithdrawal(token);
      setUndoWithdraw(token);
      toast.push({
        title: `${selected?.name ?? "Player"} withdrawn from ${day.label}`,
        detail: placement
          ? "The group lists only the players who are still coming. Undo puts them back in it."
          : "The entry stays for the other days. Undo puts them back on this one.",
        tone: "info",
      });
      setSelected(null);
    } catch (reason) {
      setSheetError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function undoWithdrawal() {
    if (!undoWithdraw) return;
    setUndoBusy(true);
    setUndoError("");
    try {
      await adapters.registrations.setDays(
        undoWithdraw.entryId,
        undoWithdraw.previousDays,
        undoWithdraw.previousSessions,
      );
      if (undoWithdraw.placement) {
        dispatch({
          type: "restoreToDraw",
          playerId: undoWithdraw.playerId,
          placement: undoWithdraw.placement,
        });
      }
      const name = players.find((player) => player.id === undoWithdraw.playerId)?.name ?? "Player";
      const groupThere =
        undoWithdraw.placement !== null &&
        (draw ?? []).some((group) => group.number === undoWithdraw.placement?.groupNumber);
      clearWithdrawal(undoWithdraw.tournamentId, undoWithdraw.dayNumber);
      setUndoWithdraw(null);
      toast.push({
        title: `${name} is back in ${day?.label ?? "the day"}`,
        detail:
          undoWithdraw.placement === null
            ? "They are back on the day's list."
            : groupThere
              ? "Their place in the group is back."
              : "They are back on the day's list. The group changed, so the desk must place them.",
        tone: "ok",
      });
    } catch (reason) {
      setUndoError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setUndoBusy(false);
    }
  }

  function moveTo(toGroup: number) {
    if (!selected) return;
    if (moveReason.trim().length < 3) {
      setSheetError("Write a short reason for the move.");
      return;
    }
    dispatch({ type: "move", playerId: selected.playerId, toGroup, reason: moveReason.trim() });
    toast.push({
      title: `${selected.name} moved to group ${toGroup}`,
      detail: "The desk keeps the reason with the board.",
      tone: "info",
    });
    setSelected(null);
  }

  if (!tournament) {
    return (
      <p className={styles.notice}>
        No event is selected. Open the full desk and choose the tournament first.
      </p>
    );
  }

  return (
    <div>
      <h1 className={styles.h1}>Players</h1>
      <p className={styles.sub}>
        {counts.arrived} of {counts.total} arrived
        {counts.needsReview > 0 ? ` · ${counts.needsReview} need review` : ""}
      </p>

      <DayPills days={days} selected={day?.number ?? null} onSelect={setDayNumber} />
      {notice && <p className={styles.notice}>{notice}</p>}

      {undoWithdraw && (
        <div className={`${styles.notice} ${styles.noticeWarn}`} role="status">
          <b>
            {players.find((player) => player.id === undoWithdraw.playerId)?.name ?? "A player"}{" "}
            withdrawn from {day?.label ?? "this day"}.
          </b>
          <p style={{ margin: "6px 0 10px" }}>
            The group lists only the players who are still coming. Undo puts them back where they
            were.
          </p>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.primary}
              disabled={undoBusy}
              onClick={() => void undoWithdrawal()}
            >
              {undoBusy ? "Saving…" : "Undo"}
            </button>
          </div>
          {undoError && (
            <p className={styles.error} role="alert">
              {undoError}
            </p>
          )}
        </div>
      )}

      <div className={styles.search}>
        <input
          className={styles.input}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, group or phone"
          aria-label="Search players"
          autoComplete="off"
        />
      </div>

      <div className={styles.filters} role="group" aria-label="Which players">
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            className={styles.filter}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {FILTER_LABELS[value]}
            {value === "not-arrived" ? ` ${counts.notArrived}` : ""}
            {value === "arrived" ? ` ${counts.arrived}` : ""}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className={styles.notice} style={{ marginTop: 14 }}>
          {query
            ? "No player matches that search. Try part of the name, the group number or the last four digits of the phone."
            : filter === "not-arrived"
              ? "Everyone on this day has arrived. Open All to see the whole list."
              : filter === "arrived"
                ? "Nobody has arrived yet. Check players in from Not arrived."
                : filter === "needs-review"
                  ? "Nobody needs review. Open All to see the whole list."
                  : "No players on this day yet. Add a walk-up if somebody turns up without an entry."}
        </p>
      ) : (
        <ul className={styles.list}>
          {visible.map((row) => (
            <li key={row.entryId} className={styles.row}>
              <button type="button" className={styles.rowMain} onClick={() => open(row)}>
                <b>{row.name}</b>
                <span className={styles.rowMeta}>
                  {row.flightId && <span>{names.flight(row.flightId)}</span>}
                  {row.group ? (
                    <span>Group {row.group.number}</span>
                  ) : (
                    <span className={styles.pillWarn}>Not placed</span>
                  )}
                  {row.teeTime && <span>{fmtTime(row.teeTime)}</span>}
                  {row.startHole ? <span>Hole {row.startHole}</span> : null}
                  {row.session && <span>{row.session}</span>}
                  {row.needsReview && <span className={styles.pillWarn}>Review</span>}
                </span>
              </button>
              <ArriveButton
                entryId={row.entryId}
                dayNumber={day?.number ?? 0}
                name={row.name}
                arrived={row.arrived}
                compact
              />
            </li>
          ))}
        </ul>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" title={selected?.name ?? "Player"} description={day?.label}>
          {selected && entry && (
            <div className={styles.sheetBody}>
              <dl className={styles.kv}>
                <dt>Status</dt>
                <dd>{selected.needsReview ? "Needs review" : "Entered"}</dd>
                <dt>Group</dt>
                <dd>
                  {selected.group ? (
                    <Link href={`/staff/schedule/${selected.group.id}`}>
                      Group {selected.group.number}, {fmtTime(selected.group.time)}, hole{" "}
                      {selected.group.startHole}
                    </Link>
                  ) : (
                    "Not placed"
                  )}
                </dd>
                <dt>Flight</dt>
                <dd>{names.flight(selected.flightId)}</dd>
                <dt>Tee off</dt>
                <dd>{selected.teeTime ? fmtTime(selected.teeTime) : "Not set"}</dd>
                <dt>Session</dt>
                <dd>{selected.session ?? "Not set"}</dd>
                <dt>Arrived</dt>
                <dd>
                  {selected.arrivedAt
                    ? new Date(selected.arrivedAt).toLocaleTimeString("en-PH", {
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "Not yet"}
                </dd>
                <dt>Days</dt>
                <dd>{Object.values(dayChoices).join(", ") || "No days selected"}</dd>
              </dl>

              {selected.needsReview && (
                <p className={`${styles.notice} ${styles.noticeWarn}`}>
                  <b>Needs review.</b> No group is assigned, so this player cannot be scored yet.
                  The organizers place them from the full desk.
                </p>
              )}

              {selected.phone && (
                <a className={styles.linkButton} href={`tel:${selected.phone.replace(/\s+/g, "")}`}>
                  <Phone aria-hidden="true" size={18} style={{ marginRight: 8 }} />
                  {selected.phone}
                </a>
              )}

              <ArriveButton
                entryId={selected.entryId}
                dayNumber={day?.number ?? 0}
                name={selected.name}
                arrived={selected.arrived}
              />

              {selected.group && (
                <Link
                  className={styles.linkButton}
                  href={`/staff/groups/${selected.group.id}/score`}
                >
                  Score this group
                  <ArrowRight aria-hidden="true" size={18} style={{ marginLeft: 8 }} />
                </Link>
              )}

              {manager && selected.group && schedule.length > 1 && (
                <div className={styles.card}>
                  <b>Move to another group</b>
                  {!moving ? (
                    <button
                      type="button"
                      className={styles.secondary}
                      style={{ marginTop: 10 }}
                      onClick={() => setMoving(true)}
                    >
                      Move {selected.name}
                    </button>
                  ) : (
                    <>
                      <p className={styles.sub} style={{ margin: "8px 0" }}>
                        Pick the group this player should walk with. The reason is kept with the
                        board.
                      </p>
                      <input
                        className={styles.input}
                        value={moveReason}
                        onChange={(event) => setMoveReason(event.target.value)}
                        placeholder="Why is the player moving?"
                        aria-label="Reason for the move"
                      />
                      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                        {schedule
                          .filter((group) => group.id !== selected.group?.id)
                          .map((group) => (
                            <button
                              key={group.id}
                              type="button"
                              className={styles.secondary}
                              onClick={() => moveTo(group.number)}
                            >
                              Group {group.number} · {fmtTime(group.time)} · hole {group.startHole}
                            </button>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {!manager && (
                <p className={styles.notice}>
                  Only an owner or organizer can move a player between groups.
                </p>
              )}

              {confirmWithdraw ? (
                <div className={`${styles.notice} ${styles.noticeWarn}`}>
                  <b>Withdraw from {day?.label}?</b>
                  <p style={{ margin: "6px 0 10px" }}>
                    The player comes off this day only. The entry and the other days stay.
                  </p>
                  <div className={styles.buttonRow}>
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={busy}
                      onClick={() => void withdrawToday()}
                    >
                      {busy ? "Saving…" : `Withdraw from ${day?.label}`}
                    </button>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => setConfirmWithdraw(false)}
                    >
                      Keep the player in
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setConfirmWithdraw(true)}
                >
                  Withdraw from this day
                </button>
              )}

              {sheetError && (
                <p className={styles.error} role="alert">
                  {sheetError}
                </p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
