"use client";

import { ArrowRight, Phone, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArriveButton } from "@/components/staff/ArriveButton";
import { BottomSheet } from "@/components/staff/BottomSheet";
import { StaffDaySelect } from "@/components/staff/StaffDaySelect";
import { useStaffDay } from "@/components/staff/day-context";
import playerStyles from "@/components/staff/players.module.css";
import { useStaffToast } from "@/components/staff/StaffToast";
import styles from "@/components/staff/staff.module.css";
import { useStaffRows } from "@/components/staff/use-rows";
import { dropCheck } from "@/lib/draw/validate";
import { placementOf } from "@/lib/draw/withdraw";
import { fmtIndex, fmtTime } from "@/lib/format";
import {
  type ArrivalFilter,
  arrivalFilterFromQuery,
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
 * Players: the arrival list. A name, the group and tee time the player should be at, and one button.
 * The sheet behind a name holds the index, the contact number, the days they play and the two
 * corrections a volunteer is allowed to make: move a player to another group (manager only) or
 * withdraw them from today.
 */
function StaffPlayers() {
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
    registrations,
    status,
    error,
    offline,
    reload,
  } = useDesk();
  const { day, days, notice, setDayNumber } = useStaffDay();
  const { rows, schedule } = useStaffRows();
  const toast = useStaffToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ArrivalFilter>("not-arrived");
  const [selected, setSelected] = useState<StaffRow | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveReason, setMoveReason] = useState("");
  const [moveTarget, setMoveTarget] = useState<number | "">("");
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [undoWithdraw, setUndoWithdraw] = useState<WithdrawUndo | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoError, setUndoError] = useState("");

  const counts = summarise(rows);
  const visible = useMemo(() => filterRows(rows, filter, query), [rows, filter, query]);
  const manager = !member || member.role === "owner" || member.role === "organizer";
  const searching = query.trim() !== "";
  const loading = status === "loading" && rows.length === 0;

  // The row snapshot can go stale after a check-in at the desk or from another phone. Show the
  // live row while the sheet is open, so the button and the arrival time stay true.
  const sheetRow: StaffRow | null = selected
    ? (rows.find((row) => row.entryId === selected.entryId) ?? selected)
    : null;
  const entry = sheetRow
    ? (entries.find((candidate) => candidate.id === sheetRow.entryId) ?? null)
    : null;
  const flightName = sheetRow ? names.flight(sheetRow.flightId).trim() : "";
  const flightLabel = /^[-–—\s]*$/.test(flightName) ? "Flight not set" : flightName;

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

  // The add screen sends a review save here with ?filter=needs-review. Read it after mount rather
  // than through useSearchParams: the hook forces this static client page into a Suspense boundary
  // that is not revealed on a full page load. Manually chosen chips are not overridden because this
  // reads the address once on mount.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("filter");
    setFilter(arrivalFilterFromQuery(requested));
  }, []);

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
    setMoveTarget("");
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
        title: `${sheetRow?.name ?? "Player"} withdrawn from ${day.label}`,
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

  function moveTo() {
    if (!selected || !tournament || !draw || moveTarget === "") {
      setSheetError("Pick the group this player should move to.");
      return;
    }
    const toGroup = moveTarget;
    if (moveReason.trim().length < 3) {
      setSheetError("Write a short reason for the move.");
      return;
    }
    // The board's reducer refuses a move into a full or locked group without telling this screen.
    // Check the same rule here so the volunteer sees why nothing happened instead of a false toast.
    const check = dropCheck(
      draw,
      tournament.config,
      new Map(registrations.map((registration) => [registration.playerId, registration])),
      selected.playerId,
      toGroup,
      names,
    );
    if (!check.ok) {
      setSheetError(check.reason);
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

  // Plain-language empty states. Each one offers the action that actually helps from here.
  let emptyTitle = "No players on this day yet";
  let emptyBody = "Add a walk-up if somebody turns up without an entry.";
  let emptyAction = (
    <Link className={`${styles.primary} ${styles.emptyAction}`} href="/staff/add">
      Add a walk-up
    </Link>
  );

  if (searching) {
    emptyTitle = "No player matches that search";
    emptyBody = "Try part of the name, the group number or the last four digits of the phone.";
    emptyAction = (
      <button
        type="button"
        className={`${styles.secondary} ${styles.emptyAction}`}
        onClick={() => setQuery("")}
      >
        Clear the search
      </button>
    );
  } else if (rows.length > 0 && filter === "not-arrived") {
    emptyTitle = "Everyone on this day has arrived";
    emptyBody = "Open All to see the whole list.";
    emptyAction = (
      <button
        type="button"
        className={`${styles.secondary} ${styles.emptyAction}`}
        onClick={() => setFilter("all")}
      >
        Show everyone
      </button>
    );
  } else if (rows.length > 0 && filter === "arrived") {
    emptyTitle = "Nobody has arrived yet";
    emptyBody = "Check players in from Not arrived.";
    emptyAction = (
      <button
        type="button"
        className={`${styles.secondary} ${styles.emptyAction}`}
        onClick={() => setFilter("not-arrived")}
      >
        Open Not arrived
      </button>
    );
  } else if (rows.length > 0 && filter === "needs-review") {
    emptyTitle = "Nobody needs review";
    emptyBody = "Open All to see the whole list.";
    emptyAction = (
      <button
        type="button"
        className={`${styles.secondary} ${styles.emptyAction}`}
        onClick={() => setFilter("all")}
      >
        Show everyone
      </button>
    );
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

      <StaffDaySelect days={days} selected={day?.number ?? null} onSelect={setDayNumber} />
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

      <div className={styles.stickyTop}>
        <div className={styles.searchRow} style={{ marginBottom: 8 }}>
          <input
            className={styles.input}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, group or phone"
            aria-label="Search players"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          {query !== "" && (
            <button
              type="button"
              className={styles.infoButton}
              aria-label="Clear the search"
              onClick={() => setQuery("")}
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}
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

        <p className={styles.searchCount}>
          {searching
            ? `${visible.length} ${visible.length === 1 ? "player matches" : "players match"} “${query.trim()}”`
            : `${visible.length} ${visible.length === 1 ? "player" : "players"} on this list`}
        </p>
      </div>

      {error && !offline && (
        <div className={styles.blockError} role="alert" style={{ marginTop: 14 }}>
          <b>The players list did not load.</b>
          <p>{error}</p>
          <button type="button" className={styles.secondary} onClick={reload}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div
          className={styles.skeletonStack}
          aria-label="Loading players"
          aria-busy="true"
          style={{ marginTop: 10 }}
        >
          {Array.from({ length: 6 }, (_, position) => (
            <div key={position} className={styles.skeletonRow}>
              <span className={styles.skeleton} />
              <span className={styles.skeleton} />
            </div>
          ))}
        </div>
      ) : visible.length > 0 ? (
        <ul className={styles.list} data-onboard="arrivals-list" aria-label="Players on this day">
          {visible.map((row) => (
            <li key={row.entryId} className={styles.row}>
              <button
                type="button"
                className={`${styles.rowMain} ${playerStyles.rowMainTap}`}
                onClick={() => open(row)}
              >
                <b>{row.name}</b>
                <span className={styles.rowMeta} style={{ gap: "3px 8px" }}>
                  {row.group ? (
                    <span>Group {row.group.number}</span>
                  ) : (
                    <span className={styles.pillWarn}>Not placed</span>
                  )}
                  {row.teeTime && <span>{fmtTime(row.teeTime)}</span>}
                  {row.session && <span>{row.session} session</span>}
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
      ) : error && !offline && rows.length === 0 ? null : (
        <div className={styles.empty} style={{ marginTop: 12 }}>
          <p className={styles.emptyTitle}>{emptyTitle}</p>
          <p>{emptyBody}</p>
          {emptyAction}
        </div>
      )}

      <BottomSheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={sheetRow?.name ?? "Player"}
        description={day?.label}
      >
        {sheetRow && entry && (
          <div className={styles.sheetBody}>
            <dl className={styles.detailList}>
              <dt>Status</dt>
              <dd>{sheetRow.needsReview ? "Needs review" : "Entered"}</dd>
              <dt>Index</dt>
              <dd>
                {fmtIndex(sheetRow.index)}
                {sheetRow.index === null ? (
                  <span className={styles.muted}> (no handicap on file)</span>
                ) : null}
              </dd>
              <dt>Group</dt>
              <dd>
                {sheetRow.group ? (
                  <Link className={styles.detailLink} href={`/staff/schedule/${sheetRow.group.id}`}>
                    Group {sheetRow.group.number}
                  </Link>
                ) : (
                  "Not placed"
                )}
              </dd>
              <dt>Flight</dt>
              <dd>{flightLabel}</dd>
              <dt>Tee time</dt>
              <dd>{sheetRow.teeTime ? fmtTime(sheetRow.teeTime) : "Not set"}</dd>
              <dt>Hole</dt>
              <dd>{sheetRow.startHole ? `Hole ${sheetRow.startHole}` : "Not set"}</dd>
              <dt>Session</dt>
              <dd>{sheetRow.session ? `${sheetRow.session} session` : "Not set"}</dd>
              <dt>Arrived</dt>
              <dd>
                {sheetRow.arrivedAt
                  ? new Date(sheetRow.arrivedAt).toLocaleTimeString("en-PH", {
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "Not yet"}
              </dd>
              {sheetRow.arrivedBy && (
                <>
                  <dt>Arrived by</dt>
                  <dd>{sheetRow.arrivedBy}</dd>
                </>
              )}
              <dt>Days</dt>
              <dd>{Object.values(dayChoices).join(", ") || "No days selected"}</dd>
            </dl>

            {sheetRow.needsReview && (
              <p className={`${styles.notice} ${styles.noticeWarn}`}>
                <b>Needs review.</b>{" "}
                {sheetRow.reviewReasons[0] ? `${sheetRow.reviewReasons[0]} ` : ""}
                No group is assigned, so this player cannot be scored yet. The organizers place them
                from the full desk.
              </p>
            )}

            {sheetRow.phone && (
              <a className={styles.linkButton} href={`tel:${sheetRow.phone.replace(/\s+/g, "")}`}>
                <Phone aria-hidden="true" size={18} style={{ marginRight: 8 }} />
                {sheetRow.phone}
              </a>
            )}

            <ArriveButton
              entryId={sheetRow.entryId}
              dayNumber={day?.number ?? 0}
              name={sheetRow.name}
              arrived={sheetRow.arrived}
            />

            {sheetRow.group && (
              <Link className={styles.linkButton} href={`/staff/groups/${sheetRow.group.id}/score`}>
                Score this group
                <ArrowRight aria-hidden="true" size={18} style={{ marginLeft: 8 }} />
              </Link>
            )}

            {manager && sheetRow.group && schedule.length > 1 && (
              <div className={styles.card}>
                <b>Move to another group</b>
                {!moving ? (
                  <button
                    type="button"
                    className={styles.secondary}
                    style={{ marginTop: 10 }}
                    onClick={() => setMoving(true)}
                  >
                    Move {sheetRow.name}
                  </button>
                ) : (
                  <>
                    <p className={styles.sub} style={{ margin: "8px 0" }}>
                      Pick the group this player should walk with. The reason is kept with the
                      board.
                    </p>
                    <label className={styles.fieldGrid} style={{ marginTop: 10 }}>
                      <span className={styles.sub} style={{ margin: 0 }}>
                        New group
                      </span>
                      <select
                        className={styles.select}
                        value={moveTarget}
                        onChange={(event) =>
                          setMoveTarget(event.target.value === "" ? "" : Number(event.target.value))
                        }
                        aria-label="New group for the player"
                        style={{ fontSize: 17 }}
                      >
                        <option value="">Choose a group</option>
                        {schedule
                          .filter((group) => group.id !== sheetRow.group?.id)
                          .map((group) => {
                            const check = dropCheck(
                              draw ?? [],
                              tournament.config,
                              new Map(
                                registrations.map((registration) => [
                                  registration.playerId,
                                  registration,
                                ]),
                              ),
                              sheetRow.playerId,
                              group.number,
                              names,
                            );
                            return (
                              <option key={group.id} value={group.number} disabled={!check.ok}>
                                Group {group.number} · {fmtTime(group.time)} · hole{" "}
                                {group.startHole}
                                {check.ok ? "" : ` — ${check.reason}`}
                              </option>
                            );
                          })}
                      </select>
                    </label>
                    <input
                      className={styles.input}
                      value={moveReason}
                      onChange={(event) => setMoveReason(event.target.value)}
                      placeholder="Why is the player moving?"
                      aria-label="Reason for the move"
                      style={{ marginTop: 8 }}
                    />
                    <button
                      type="button"
                      className={styles.primary}
                      style={{ marginTop: 10 }}
                      disabled={moveTarget === ""}
                      onClick={() => moveTo()}
                    >
                      Move player
                    </button>
                    <p className={styles.saving} style={{ margin: "8px 0 0" }}>
                      Full and locked groups are disabled.
                    </p>
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
                    className={styles.dangerSolid}
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
                className={styles.danger}
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
      </BottomSheet>
    </div>
  );
}

export default StaffPlayers;
