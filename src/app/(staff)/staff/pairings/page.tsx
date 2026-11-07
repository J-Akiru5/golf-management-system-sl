"use client";

import { ArrowLeft, Lock, Printer, Unlock, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DayPills } from "@/components/staff/DayPills";
import { useStaffDay } from "@/components/staff/day-context";
import styles from "@/components/staff/staff.module.css";
import { useStaffRows } from "@/components/staff/use-rows";
import { useToast } from "@/components/ui/toast";
import { dropCheck } from "@/lib/draw/validate";
import { fmtTime } from "@/lib/format";
import { unplacedRows } from "@/lib/staff/rows";
import { useDesk } from "@/lib/store/desk-store";

/**
 * The staff pairing board. It uses the same move, drop and lock rules as the organizer desk, but
 * presents them as one choice per player instead of drag-and-drop. The event's group size, flights,
 * tee order and start format stay in the engine; this screen does not invent new defaults.
 */
export default function StaffPairingsPage() {
  const { tournament, draw, registrations, regById, names, dispatch, adapters } = useDesk();
  const { day, days, notice, setDayNumber } = useStaffDay();
  const { rows, schedule } = useStaffRows();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("Staff pairing edit");
  const [error, setError] = useState("");

  const groupSize = tournament?.config.groupSize ?? 4;
  const regMap = useMemo(
    () => new Map(registrations.map((registration) => [registration.playerId, registration])),
    [registrations],
  );
  const unplacedHere = useMemo(() => unplacedRows(rows), [rows]);
  const needle = query.trim().toLowerCase();
  const visibleGroups = useMemo(
    () =>
      schedule.filter(
        (group) =>
          needle === "" ||
          String(group.number).includes(needle) ||
          group.flightName.toLowerCase().includes(needle) ||
          group.players.some((player) => player.playerName.toLowerCase().includes(needle)),
      ),
    [schedule, needle],
  );
  const visibleUnplaced = useMemo(
    () => unplacedHere.filter((row) => needle === "" || row.name.toLowerCase().includes(needle)),
    [unplacedHere, needle],
  );

  function checkReason() {
    if (reason.trim().length < 3) {
      setError("Write a short reason for the change. The desk keeps it with the board.");
      return false;
    }
    setError("");
    return true;
  }

  function movePlayer(playerId: string, name: string, toGroup: number) {
    if (!draw || !tournament) return;
    if (!checkReason()) return;
    const check = dropCheck(draw, tournament.config, regMap, playerId, toGroup, names);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    dispatch({
      type: "move",
      playerId,
      toGroup,
      reason: reason.trim(),
    });
    toast.push({
      title: `${name} moved to group ${toGroup}`,
      detail: check.notes.length > 0 ? check.notes.join(" ") : "The board keeps the reason.",
      tone: "info",
    });
  }

  function removePlayer(playerId: string, name: string) {
    if (!checkReason()) return;
    dispatch({ type: "withdrawFromDraw", playerId });
    toast.push({
      title: `${name} removed from the group`,
      detail: "They stay on the day's list and can be added to another group.",
      tone: "info",
    });
  }

  function toggleLock(groupNumber: number, locked: boolean) {
    if (!checkReason()) return;
    dispatch({
      type: "setGroupLocked",
      group: groupNumber,
      locked: !locked,
      reason: reason.trim(),
    });
    toast.push({
      title: locked ? `Group ${groupNumber} unlocked` : `Group ${groupNumber} locked`,
      detail: locked
        ? "Players can be moved in and out again."
        : "The group stays as it is until somebody unlocks it.",
      tone: "info",
    });
  }

  function createPairings() {
    if (!tournament) return;
    adapters.router.propose(false);
    toast.push({
      title: "Pairings created",
      detail: "The event's group size, flights, tee order and start format were used.",
      tone: "ok",
    });
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
      <h1 className={styles.h1}>Pairings</h1>
      <p className={styles.sub}>
        {tournament.name} · {schedule.length} groups · group size {groupSize} ·{" "}
        {tournament.config.startFormat === "shotgun" ? "shotgun start" : "two-tee start"}
      </p>

      <div className={styles.toolRow}>
        <Link className={styles.toolLink} href="/staff/schedule">
          <ArrowLeft aria-hidden="true" size={18} />
          Schedule
        </Link>
        <Link className={styles.toolLink} href="/staff/print">
          <Printer aria-hidden="true" size={18} />
          Print
        </Link>
      </div>

      <DayPills days={days} selected={day?.number ?? null} onSelect={setDayNumber} />
      {notice && <p className={styles.notice}>{notice}</p>}

      {!draw ? (
        <section style={{ marginTop: 14 }}>
          <p className={`${styles.notice} ${styles.noticeWarn}`}>
            This day has no pairings yet. The engine will use the event defaults: group size,
            flights, tee order and start format. It will not invent a place for a player it cannot
            route.
          </p>
          <button type="button" className={styles.primary} onClick={createPairings}>
            <Users aria-hidden="true" size={20} style={{ marginRight: 8 }} />
            Create pairings
          </button>
        </section>
      ) : (
        <>
          <label className={styles.fieldGrid} style={{ margin: "14px 0 10px" }}>
            <span className={styles.sub} style={{ margin: 0 }}>
              Reason for these changes
            </span>
            <input
              className={styles.input}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-label="Reason for the pairing changes"
            />
          </label>
          <p className={styles.saving} style={{ margin: "0 0 12px" }}>
            Changes save to the board as you make them. Publishing stays with the full desk.
          </p>

          <div className={styles.search}>
            <input
              className={styles.input}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a player or group"
              aria-label="Find a player or group in the pairings"
            />
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          {visibleUnplaced.length > 0 && (
            <section className={styles.card} style={{ marginBottom: 16 }}>
              <div className={styles.sectionHead} style={{ marginTop: 0 }}>
                <h2>Not in a group</h2>
                <span>{visibleUnplaced.length}</span>
              </div>
              <p className={styles.hint}>
                Add a player to a group with room. A full or locked group stays disabled.
              </p>
              <div className={styles.unplacedList}>
                {visibleUnplaced.map((row) => (
                  <div key={row.entryId} className={styles.pairPlayer}>
                    <span>
                      <b>{row.name}</b>
                      <span>{row.flightId ? names.flight(row.flightId) : "Flight not set"}</span>
                    </span>
                    <select
                      className={styles.select}
                      value=""
                      aria-label={`Add ${row.name} to a group`}
                      onChange={(event) => {
                        if (event.target.value === "") return;
                        movePlayer(row.playerId, row.name, Number(event.target.value));
                      }}
                    >
                      <option value="">Add to a group</option>
                      {schedule.map((group) => {
                        const check = draw
                          ? dropCheck(
                              draw,
                              tournament.config,
                              regMap,
                              row.playerId,
                              group.number,
                              names,
                            )
                          : null;
                        return (
                          <option key={group.id} value={group.number} disabled={!check?.ok}>
                            Group {group.number} · {fmtTime(group.time)} · hole {group.startHole}
                            {check && !check.ok ? ` — ${check.reason}` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          )}

          {visibleGroups.length === 0 ? (
            <p className={styles.notice}>
              Nothing matches that search. Clear it to see every group.
            </p>
          ) : (
            <div>
              {visibleGroups.map((group) => {
                const boardGroup = draw.find((candidate) => candidate.number === group.number);
                const locked = boardGroup?.locked ?? false;
                return (
                  <section key={group.id} className={styles.pairGroup}>
                    <header className={styles.pairGroupHead}>
                      <div>
                        <b>
                          Group {group.number} · {fmtTime(group.time)}
                        </b>
                        <span>
                          Hole {group.startHole} · {group.flightName} · {group.players.length}/
                          {groupSize} players
                        </span>
                      </div>
                      <button
                        type="button"
                        className={styles.secondary}
                        style={{ width: "auto", minWidth: 96, minHeight: 44, padding: "0 12px" }}
                        onClick={() => toggleLock(group.number, locked)}
                      >
                        {locked ? (
                          <>
                            <Unlock aria-hidden="true" size={16} /> Unlock
                          </>
                        ) : (
                          <>
                            <Lock aria-hidden="true" size={16} /> Lock
                          </>
                        )}
                      </button>
                    </header>

                    {group.players.length === 0 ? (
                      <p className={styles.hint}>No players in this group yet.</p>
                    ) : (
                      group.players.map((player) => {
                        const registration = regById.get(player.playerId);
                        return (
                          <div key={player.playerId} className={styles.pairPlayer}>
                            <span>
                              <b>{player.playerName}</b>
                              <span>
                                {registration?.flightId
                                  ? names.flight(registration.flightId)
                                  : "Flight not set"}
                                {locked ? " · group locked" : ""}
                              </span>
                            </span>
                            <div style={{ display: "grid", gap: 6 }}>
                              <select
                                className={styles.select}
                                value=""
                                disabled={locked}
                                aria-label={`Move ${player.playerName} to another group`}
                                onChange={(event) => {
                                  if (event.target.value === "") return;
                                  movePlayer(
                                    player.playerId,
                                    player.playerName,
                                    Number(event.target.value),
                                  );
                                }}
                              >
                                <option value="">{locked ? "Unlock to move" : "Move to…"}</option>
                                {!locked &&
                                  schedule
                                    .filter((other) => other.number !== group.number)
                                    .map((other) => {
                                      const check = draw
                                        ? dropCheck(
                                            draw,
                                            tournament.config,
                                            regMap,
                                            player.playerId,
                                            other.number,
                                            names,
                                          )
                                        : null;
                                      return (
                                        <option
                                          key={other.id}
                                          value={other.number}
                                          disabled={!check?.ok}
                                        >
                                          Group {other.number} · {fmtTime(other.time)} · hole{" "}
                                          {other.startHole}
                                          {check && !check.ok ? ` — ${check.reason}` : ""}
                                        </option>
                                      );
                                    })}
                              </select>
                              <button
                                type="button"
                                className={styles.secondary}
                                style={{ minHeight: 40, width: "auto", padding: "0 12px" }}
                                disabled={locked}
                                onClick={() => removePlayer(player.playerId, player.playerName)}
                              >
                                Remove from group
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {unplacedHere.length > 0 && (
            <p className={styles.saving}>
              {unplacedHere.length} player{unplacedHere.length === 1 ? "" : "s"} on this day still
              need a group.
            </p>
          )}
        </>
      )}
    </div>
  );
}
