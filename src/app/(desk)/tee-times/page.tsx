"use client";

import { CalendarClock, Check, CircleAlert, Clock, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { isFinalPlayingDay, playingDaysOf } from "@/lib/data/dates";
import { fmtIso } from "@/lib/data/labels";
import {
  type DaySession,
  type SessionKey,
  sessionSummaryOf,
  sessionsForDay,
} from "@/lib/data/sessions";
import {
  batchAssignment,
  startCountForField,
  startTimesFrom,
  teeAssignmentProblem,
} from "@/lib/data/tee-time";
import type {
  Caddie,
  DayTeeAssignment,
  PlayerRecord,
  RegistrationEntry,
  TournamentDay,
} from "@/lib/data/types";
import {
  batchLetters,
  type DrawPlacement,
  placementsFromDraw,
  sessionForRow,
} from "@/lib/draw/tee-times";
import { fmtIndex, fmtTime } from "@/lib/format";
import { useDesk } from "@/lib/store/desk-store";

/**
 * Tee times per playing day. Day selection and tee-time assignment are separate writes: this screen
 * only changes the confirmed time, start hole and confirmation flag for a day the player has already
 * selected. The database function checks the course's hole count and the day's start time.
 */
export default function TeeTimesPage() {
  const { tournament, days, entries, players, caddies, adapters, status, draw, drawDay } =
    useDesk();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [batchTime, setBatchTime] = useState("");
  const [batching, setBatching] = useState<"missing" | "all" | "draw" | null>(null);
  const [batchMessage, setBatchMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(
    null,
  );
  // Playing days only, in day order: the position names the day's sessions, and the print center
  // reads the same list. A trailing non-playing day must not move the last playing day's afternoon.
  const playingDays = useMemo(() => playingDaysOf(days), [days]);
  // The day on screen: the one the operator picked here, else the day whose board the desk loaded.
  // Opening from a remembered day therefore shows that day instead of day 1 beside day 4's board.
  const day =
    playingDays.find((d) => d.dayNumber === (selectedDay ?? drawDay)) ?? playingDays[0] ?? null;
  // The morning and afternoon this day runs, read from what the desk stored: the day's own start,
  // the day's own afternoon start, then the event's afternoon time. Each session says whether its
  // time is stored or a fallback, so the subtitle never reads a default as the club's choice.
  const sessions = useMemo(
    () =>
      day
        ? sessionsForDay(
            // A day with no start of its own opens at the event's first tee time, the same fallback
            // the draw store uses. The afternoon comes from the stored settings only.
            {
              startTime: day.startTime ?? tournament?.config.firstTeeTime,
              pmStartTime: day.pmStartTime,
            },
            {
              eventPmStart: tournament?.config.pmFirstTeeTime,
              finalDay: isFinalPlayingDay(day, playingDays),
            },
          )
        : [],
    [day, playingDays, tournament],
  );

  // The day's own start time, editable per day: Sunday's morning is not Thursday's. A draft keeps the
  // day it was typed for, so switching days shows that day's saved value instead of the last edit.
  const dayKey = day ? `${day.id}-${day.dayNumber}` : "";
  const [dayStartDraft, setDayStartDraft] = useState<{ key: string; value: string } | null>(null);
  const [dayStartSaving, setDayStartSaving] = useState(false);
  const [dayStartResult, setDayStartResult] = useState<{
    key: string;
    tone: "ok" | "bad";
    text: string;
  } | null>(null);
  // The afternoon start follows the same per-day draft: a value typed for one day never shows on
  // another, and clearing it makes that day use the event's afternoon time again.
  const [pmStartDraft, setPmStartDraft] = useState<{ key: string; value: string } | null>(null);
  const [pmStartSaving, setPmStartSaving] = useState(false);
  const [pmStartResult, setPmStartResult] = useState<{
    key: string;
    tone: "ok" | "bad";
    text: string;
  } | null>(null);

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );
  // Where the draw put each player: the time and hole the draw's group starts with. Only this day's
  // board can give this day its times, so a board loaded for another playing day yields nothing
  // rather than one day's holes landing on another day.
  const placements = useMemo(
    () =>
      day && (drawDay === null || drawDay === day.dayNumber)
        ? placementsFromDraw(draw ?? [], day.dayNumber)
        : new Map<string, DrawPlacement>(),
    [draw, day, drawDay],
  );
  const rows = useMemo(() => {
    if (!day) return [];
    return entries
      .filter((entry) => (entry.selectedDays ?? []).includes(day.dayNumber))
      .map((entry) => ({ entry, player: playerById.get(entry.playerId) ?? null }))
      .filter((row): row is { entry: RegistrationEntry; player: PlayerRecord } =>
        Boolean(row.player),
      )
      .sort((a, b) => a.player.name.localeCompare(b.player.name));
  }, [entries, playerById, day]);

  if (!tournament) return <NeedsTournament what="Tee times" />;
  if (status === "loading") {
    return <div className="notice">Loading the event and its players…</div>;
  }

  const assigned = rows.filter(({ entry }) => {
    const tee = day ? entry.dayTee?.[day.dayNumber] : null;
    return Boolean(tee?.teeTime && tee.startHole);
  }).length;
  const confirmed = rows.filter(
    ({ entry }) => day && entry.dayTee?.[day.dayNumber]?.confirmed,
  ).length;
  const timed = rows.filter(({ entry }) => day && entry.dayTee?.[day.dayNumber]?.teeTime).length;
  const untimed = rows.length - timed;
  /** Players on this day whose group is on the board, so the draw can give them a time. */
  const fromDraw = rows.filter(({ player }) => placements.has(player.id)).length;
  const config = tournament.config;
  // The operator types the batch time. A group's own start comes from the draw.
  const chosenTime = batchTime || config.firstTeeTime;
  const dayStart = dayStartDraft?.key === dayKey ? dayStartDraft.value : (day?.startTime ?? "");
  const dayStartMessage = dayStartResult?.key === dayKey ? dayStartResult : null;
  const pmStart = pmStartDraft?.key === dayKey ? pmStartDraft.value : (day?.pmStartTime ?? "");
  const pmStartMessage = pmStartResult?.key === dayKey ? pmStartResult : null;

  // How many start times this day's field needs. Every hole holding one group is one start, and the
  // rest of the field follows one interval later. There is no fixed two: a bigger field gets a third
  // start and a fourth, and the letters follow the same count.
  const startsNeeded = startCountForField(rows.length, config.holes, config.groupSize);
  const starts = startTimesFrom(
    day?.startTime?.trim() || config.firstTeeTime,
    config.intervalMinutes,
    startsNeeded,
  );
  const letters = batchLetters(startsNeeded);
  /** "06:30 (A), 06:45 (B)" for the start times this day needs, in order. */
  const startList = starts
    .map((start, index) => {
      const letter = letters[index];
      return letter ? `${start.time} (${letter})` : start.time;
    })
    .join(", ");
  /** Said instead of taking times when the board on screen is another playing day's board. */
  const boardDayWarning =
    day && drawDay !== null && drawDay !== day.dayNumber
      ? `The board on screen is Day ${drawDay}. Open the Draw screen on Day ${day.dayNumber} to take Day ${day.dayNumber}'s times.`
      : null;

  const pmSession = sessions.find((session) => session.key === "PM") ?? null;
  const pmTime = pmSession?.time ?? config.pmFirstTeeTime ?? config.firstTeeTime;
  // Which afternoon time is the record and which is only a fallback, so nobody reads a default as
  // the club's stored choice.
  const pmHint = day?.pmStartTime
    ? `Stored for this day: ${pmTime}. Other days keep their own. Leave it empty to use the event's afternoon time.`
    : pmSession?.source === "stored"
      ? `Not stored for this day, so the event's time is used: ${pmTime}.`
      : `Not stored for this day. It falls back to a default time, ${pmTime}.`;

  // `sessionSummaryOf` writes "AM 06:30 · PM 12:30". Each time says where it came from, so a
  // fallback is never read as the club's stored choice.
  const daySummary = sessionSummaryOf(
    sessions.map((session) => ({
      ...session,
      time: `${session.time}${
        session.source === "default" ? " (default)" : session.source === "stored" ? " (stored)" : ""
      }`,
    })),
  );

  /**
   * Writes one start time to the day, in small parallel batches.
   *
   * "missing" fills only players with no time yet, which is the normal start of a shotgun day.
   * "all" overwrites every time but keeps each player's start hole. A confirmation survives only
   * when the time did not change: a start moved from 06:30 to 12:30 needs the desk to look again.
   */
  async function applyBatch(mode: "missing" | "all") {
    if (!day || batching) return;
    const time = chosenTime.trim();
    if (!/^\d{2}:\d{2}$/.test(time)) {
      setBatchMessage({ tone: "bad", text: "Choose a tee time first." });
      return;
    }
    const targets = rows.filter(
      ({ entry }) => mode === "all" || !entry.dayTee?.[day.dayNumber]?.teeTime,
    );
    if (targets.length === 0) {
      setBatchMessage({ tone: "ok", text: "Every player on this day already has a time." });
      return;
    }
    setBatching(mode);
    setBatchMessage(null);
    let saved = 0;
    const failed: string[] = [];
    const queue = [...targets];
    const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (;;) {
        const row = queue.shift();
        if (!row) return;
        const existing = row.entry.dayTee?.[day.dayNumber];
        try {
          await adapters.registrations.assignDayTee(
            row.entry.id,
            day.dayNumber,
            batchAssignment(existing, time),
          );
          saved += 1;
        } catch {
          failed.push(row.player.name);
        }
      }
    });
    await Promise.all(workers);
    setBatching(null);
    setBatchMessage(
      failed.length > 0
        ? {
            tone: "bad",
            text: `Set ${time} for ${saved} player${saved === 1 ? "" : "s"}. ${failed.length} could not be saved: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}.`,
          }
        : {
            tone: "ok",
            text: `Set ${time} for ${saved} player${saved === 1 ? "" : "s"}. Each player keeps their start hole. A new time is saved unconfirmed, so the desk ticks it again.`,
          },
    );
  }

  /**
   * Copies the draw onto this day: each player's start time and start hole come from the group they
   * were drawn into. Nothing is invented for a player the board has no group for; those stay without
   * a time and are counted in the message. Times are saved unconfirmed, so the desk still ticks each
   * one after looking at it.
   */
  async function applyFromDraw() {
    if (!day || batching) return;
    // The board must be this day's: another day's group would write its hole and time here.
    if (boardDayWarning) {
      setBatchMessage({ tone: "bad", text: boardDayWarning });
      return;
    }
    const targets: {
      entry: RegistrationEntry;
      player: PlayerRecord;
      placed: DrawPlacement;
      teeTime: string;
    }[] = [];
    for (const { entry, player } of rows) {
      const placed = placements.get(player.id);
      if (!placed) continue;
      targets.push({
        entry,
        player,
        placed,
        teeTime: placed.time,
      });
    }
    if (targets.length === 0) {
      setBatchMessage({
        tone: "bad",
        text: "The draw has no group for anyone on this day yet. Make the draw first.",
      });
      return;
    }
    setBatching("draw");
    setBatchMessage(null);
    let saved = 0;
    const failed: string[] = [];
    const queue = [...targets];
    const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (;;) {
        const item = queue.shift();
        if (!item) return;
        try {
          await adapters.registrations.assignDayTee(item.entry.id, day.dayNumber, {
            teeTime: item.teeTime,
            startHole: item.placed.startHole,
            // Only the batch letter a stored label names, never the whole label ("D1-AM-A").
            wave: item.placed.batch ?? null,
            confirmed: false,
          });
          saved += 1;
        } catch {
          failed.push(item.player.name);
        }
      }
    });
    await Promise.all(workers);
    setBatching(null);
    const left = rows.length - targets.length;
    setBatchMessage(
      failed.length > 0
        ? {
            tone: "bad",
            text: `Took the draw's start time and hole for ${saved} player${saved === 1 ? "" : "s"}. ${failed.length} could not be saved: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}.`,
          }
        : {
            tone: "ok",
            text: `Took the draw's start time and hole for ${saved} player${saved === 1 ? "" : "s"}${
              left > 0 ? `; ${left} on this day ${left === 1 ? "has" : "have"} no group yet` : ""
            }. Each time is the start their group was drawn into, saved unconfirmed so the desk still ticks it.`,
          },
    );
  }

  /** Saves this day's own opening time, which the morning start uses on this day only. */
  async function saveDayStart(time: string) {
    if (!day || dayStartSaving) return;
    const event = tournament;
    if (!event) return;
    setDayStartSaving(true);
    setDayStartResult(null);
    try {
      await adapters.tournaments.setDayStart(event.id, day.dayNumber, time || null);
      setDayStartResult({
        key: dayKey,
        tone: "ok",
        text: time
          ? `Saved. This day starts at ${time}.`
          : "Cleared. This day starts at the event's first tee time.",
      });
    } catch (error) {
      setDayStartResult({
        key: dayKey,
        tone: "bad",
        text:
          error instanceof Error ? error.message : "Could not save the start time for this day.",
      });
    } finally {
      setDayStartSaving(false);
    }
  }

  /**
   * Saves this day's own afternoon start, or clears it so the day uses the event's afternoon time.
   * Only this day moves: the other days keep the time each already has.
   */
  async function savePmStart(time: string) {
    if (!day || pmStartSaving) return;
    const event = tournament;
    if (!event) return;
    setPmStartSaving(true);
    setPmStartResult(null);
    try {
      await adapters.tournaments.setDayPmStart(event.id, day.dayNumber, time || null);
      setPmStartResult({
        key: dayKey,
        tone: "ok",
        text: time
          ? `Saved. This day's afternoon starts at ${time}.`
          : "Cleared. This day's afternoon uses the event's time.",
      });
    } catch (error) {
      setPmStartResult({
        key: dayKey,
        tone: "bad",
        text:
          error instanceof Error
            ? error.message
            : "Could not save the afternoon start for this day.",
      });
    } finally {
      setPmStartSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        overline="Scheduling"
        title="Tee times"
        crumbs={[{ label: tournament.name, href: "/tournaments" }, { label: "Tee times" }]}
      >
        Choose a playing day, then set the confirmed tee time and starting hole for the players who
        selected that day. This is separate from the day selection and from the player&apos;s
        preference. A time appears on the public page only after it is ticked as confirmed.
      </PageHeader>

      {playingDays.length === 0 ? (
        <div className="notice warn" role="status">
          This event has no playing days. Save the event dates in Settings first.
        </div>
      ) : (
        <>
          <div className="seg" role="tablist" aria-label="Playing day">
            {playingDays.map((item) => {
              const count = entries.filter((entry) =>
                (entry.selectedDays ?? []).includes(item.dayNumber),
              ).length;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={day?.dayNumber === item.dayNumber}
                  aria-pressed={day?.dayNumber === item.dayNumber}
                  className="min-h-11"
                  onClick={() => setSelectedDay(item.dayNumber)}
                >
                  {item.label} · {fmtIso(item.playDate)} ({count})
                </button>
              );
            })}
          </div>

          {day && (
            <SectionCard
              id="tee-times"
              icon={<CalendarClock />}
              title={`${day.label} · ${fmtIso(day.playDate)}`}
              subtitle={`${daySummary}. ${
                day.startTime
                  ? `The day opens at ${day.startTime}, and times before that are refused.`
                  : "No day start time is set, so the event's first tee time is the floor."
              }`}
            >
              <div className="grid gap-2 rounded-[12px] border border-line bg-surface-sunken p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="field w-36">
                    <span>Day start (AM)</span>
                    <input
                      type="time"
                      value={dayStart}
                      disabled={dayStartSaving}
                      className="min-h-11 text-[16px] md:min-h-0 md:text-sm"
                      onChange={(event) => {
                        setDayStartDraft({ key: dayKey, value: event.target.value });
                        setDayStartResult(null);
                      }}
                      aria-label={`Start time for ${day.label}`}
                    />
                  </label>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-11 md:min-h-0"
                    disabled={dayStartSaving || dayStart === (day.startTime ?? "")}
                    onClick={() => void saveDayStart(dayStart)}
                  >
                    {dayStartSaving ? "Saving…" : "Save day start"}
                  </Button>
                  <span
                    className={dayStartMessage?.tone === "bad" ? "hint !text-danger" : "hint"}
                    role={dayStartMessage?.tone === "bad" ? "alert" : "status"}
                  >
                    {dayStartMessage
                      ? dayStartMessage.text
                      : `Only this day moves. Leave it empty to start at the event's first tee time, ${fmtTime(config.firstTeeTime)}.`}
                  </span>
                </div>
                {/* The afternoon start is this day's own setting. Empty means the event's time. */}
                <div className="flex flex-wrap items-end gap-2">
                  <label className="field w-36">
                    <span>Afternoon start (PM)</span>
                    <input
                      type="time"
                      value={pmStart}
                      disabled={pmStartSaving}
                      className="min-h-11 text-[16px] md:min-h-0 md:text-sm"
                      onChange={(event) => {
                        setPmStartDraft({ key: dayKey, value: event.target.value });
                        setPmStartResult(null);
                      }}
                      aria-label={`Afternoon start time for ${day.label}`}
                    />
                  </label>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-11 md:min-h-0"
                    disabled={pmStartSaving || pmStart === (day.pmStartTime ?? "")}
                    onClick={() => void savePmStart(pmStart)}
                  >
                    {pmStartSaving ? "Saving…" : "Save PM start"}
                  </Button>
                  <span
                    className={pmStartMessage?.tone === "bad" ? "hint !text-danger" : "hint"}
                    role={pmStartMessage?.tone === "bad" ? "alert" : "status"}
                  >
                    {pmStartMessage ? pmStartMessage.text : pmHint}
                  </span>
                </div>
              </div>

              <div className="tiles grid-cols-2 lg:grid-cols-4">
                <div className="tile">
                  <b>{rows.length}</b>
                  <span>Players on this day</span>
                </div>
                <div className="tile">
                  <b>{assigned}</b>
                  <span>With a time and hole</span>
                </div>
                <div className="tile">
                  <b>{confirmed}</b>
                  <span>Confirmed</span>
                </div>
                <div className={`tile${rows.length - assigned > 0 ? " warn" : ""}`}>
                  <b>{rows.length - assigned}</b>
                  <span>Still to assign</span>
                </div>
              </div>

              {boardDayWarning && (
                <div className="notice warn" role="status">
                  {boardDayWarning}
                </div>
              )}

              {config.startFormat === "shotgun" && startsNeeded > 2 && (
                <div className="notice warn" role="status">
                  This day&apos;s {rows.length} players need {startsNeeded} start times: {startList}
                  . Check the hole count and the group size, or expect a longer session.
                </div>
              )}

              {config.startFormat === "shotgun" && rows.length > 0 && (
                <div className="grid gap-3 rounded-[12px] border border-line bg-surface-sunken p-3">
                  <div>
                    <b className="text-[14px]">Start times and the batch time</b>
                    <p className="hint mt-0.5">
                      A shotgun start sends every player off at once. When the {config.holes} holes
                      are full, the rest go off one interval later in the same session, so this day
                      can have more than one start. This day holds {rows.length} players. A batch
                      time is typed below, or each player&apos;s start time and hole are taken from
                      the draw.{" "}
                      <Link href="/setup#start" className="underline">
                        Change the event times in Settings
                      </Link>
                      . Either way the time is saved unconfirmed until the desk ticks it.
                    </p>
                    {startsNeeded <= 2 && (
                      <p className="hint mt-0.5">
                        This day needs {startsNeeded} start {startsNeeded === 1 ? "time" : "times"}:{" "}
                        {startList}.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="field w-36">
                      <span>Batch time</span>
                      <input
                        type="time"
                        value={chosenTime}
                        disabled={batching !== null}
                        className="text-[16px] md:text-sm"
                        onChange={(event) => {
                          setBatchTime(event.target.value);
                          setBatchMessage(null);
                        }}
                      />
                    </label>
                    <Button
                      variant="primary"
                      size="sm"
                      className="min-h-11 md:min-h-0"
                      disabled={batching !== null || untimed === 0}
                      onClick={() => void applyBatch("missing")}
                    >
                      {batching === "missing"
                        ? "Setting…"
                        : `Set ${chosenTime} for ${untimed} without a time`}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 md:min-h-0"
                      disabled={batching !== null}
                      onClick={() => void applyBatch("all")}
                    >
                      {batching === "all" ? "Overwriting…" : `Overwrite all ${rows.length}`}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-11 md:min-h-0"
                      disabled={batching !== null || fromDraw === 0}
                      onClick={() => void applyFromDraw()}
                    >
                      {batching === "draw"
                        ? "Taking the draw…"
                        : `Take the draw's times (${fromDraw})`}
                    </Button>
                  </div>
                  {batchMessage && (
                    <p
                      className={batchMessage.tone === "bad" ? "notice bad" : "notice ok"}
                      role="status"
                    >
                      {batchMessage.text}
                    </p>
                  )}
                </div>
              )}

              {rows.length === 0 ? (
                <div className="notice" role="status">
                  No player has selected this day yet. Use the registration desk to add the day to a
                  player&apos;s entry.
                </div>
              ) : (
                <div className="table-wrap !shadow-none">
                  <table>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Index</th>
                        <th>Membership</th>
                        <th>Session</th>
                        <th>Tee time</th>
                        <th>Start hole</th>
                        <th>Confirmed</th>
                        <th>Caddie (optional)</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ entry, player }) => (
                        <TeeRow
                          key={`${entry.id}-${day.dayNumber}`}
                          entry={entry}
                          player={player}
                          day={day}
                          caddies={caddies.filter((caddie) => caddie.active)}
                          courseHoles={tournament.config.holes}
                          sessions={sessions}
                          placementSession={placements.get(player.id)?.session ?? null}
                          onSave={(assignment) =>
                            adapters.registrations.assignDayTee(entry.id, day.dayNumber, assignment)
                          }
                          onAssignCaddie={(caddieId) =>
                            adapters.caddies.assign(entry.id, day.dayNumber, caddieId)
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {/* Phone only: the batch controls sit below a long table, so the time and the draw's
              times stay within reach above the app's bottom tab bar. The card's own controls
              remain. */}
          {day && config.startFormat === "shotgun" && rows.length > 0 && (
            <div className="no-print sticky bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-20 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-surface/95 px-4 py-2 backdrop-blur md:hidden">
              <label className="field w-32">
                <span className="sr-only">Batch time</span>
                <input
                  type="time"
                  value={chosenTime}
                  disabled={batching !== null}
                  className="text-[16px] md:text-sm"
                  aria-label="Batch time for the phone action bar"
                  onChange={(event) => {
                    setBatchTime(event.target.value);
                    setBatchMessage(null);
                  }}
                />
              </label>
              <Button
                variant="secondary"
                size="sm"
                className="min-h-11 flex-1"
                disabled={batching !== null || fromDraw === 0}
                onClick={() => void applyFromDraw()}
              >
                {batching === "draw" ? "Taking the draw…" : `Take the draw's times (${fromDraw})`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TeeRow({
  entry,
  player,
  day,
  caddies,
  courseHoles,
  sessions,
  placementSession,
  onSave,
  onAssignCaddie,
}: {
  entry: RegistrationEntry;
  player: PlayerRecord;
  day: TournamentDay;
  caddies: Caddie[];
  courseHoles: number;
  /** The morning and afternoon this day runs, read from what the desk stored. */
  sessions: readonly DaySession[];
  /** The session a stored draw label names, when the board had one. */
  placementSession: SessionKey | null;

  onSave: (assignment: DayTeeAssignment) => Promise<void>;
  onAssignCaddie: (caddieId: string | null) => Promise<void>;
}) {
  const saved = entry.dayTee?.[day.dayNumber];
  const [teeTime, setTeeTime] = useState(saved?.teeTime ?? "");
  const [startHole, setStartHole] = useState(saved?.startHole ? String(saved.startHole) : "");
  const [confirmed, setConfirmed] = useState(saved?.confirmed ?? false);
  const [caddieId, setCaddieId] = useState(entry.caddieByDay?.[day.dayNumber]?.caddieId ?? "");
  const [saving, setSaving] = useState(false);
  const [caddieSaving, setCaddieSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  // The session the desk recorded for this day wins, then the session a stored draw label names,
  // then the time itself. The row never invents one of the two.
  const sessionKey = sessionForRow({
    chosen: entry.daySessions?.[day.dayNumber] ?? null,
    placement: placementSession,
    time: teeTime || null,
    sessions,
  });
  const sessionLabel = sessions.find((session) => session.key === sessionKey)?.label ?? null;

  /**
   * The one place that turns the row's fields into a write. Used by Save, by Clear, and by the
   * confirmation checkbox, so all three refuse the same invalid combinations with the same words.
   */
  function resolveAssignment(
    timeText: string,
    holeText: string,
    isConfirmed: boolean,
  ): { assignment: DayTeeAssignment } | { error: string } {
    const hole = holeText ? Number(holeText) : null;
    const problem = teeAssignmentProblem({
      teeTime: timeText || null,
      startHole: hole,
      confirmed: isConfirmed,
      courseHoles,
    });
    if (problem === "both_or_neither") {
      return { error: "A start hole needs a tee time. Add a time, or clear the hole." };
    }
    if (problem === "hole_range") {
      return { error: `The start hole must be between 1 and ${courseHoles}.` };
    }
    if (problem === "confirmed_needs_both") {
      return { error: "A confirmed time needs both the tee time and the start hole." };
    }
    return {
      assignment: {
        teeTime: timeText || null,
        startHole: hole,
        wave: null,
        confirmed: isConfirmed,
      },
    };
  }

  async function save(next?: DayTeeAssignment) {
    setMessage(null);
    const resolved = next
      ? { assignment: next }
      : resolveAssignment(teeTime.trim(), startHole.trim(), confirmed);
    if ("error" in resolved) {
      setMessage({ tone: "bad", text: resolved.error });
      return;
    }
    const { assignment } = resolved;

    setSaving(true);
    try {
      await onSave(assignment);
      setTeeTime(assignment.teeTime ?? "");
      setStartHole(assignment.startHole ? String(assignment.startHole) : "");
      setConfirmed(assignment.confirmed);
      setMessage({ tone: "ok", text: assignment.confirmed ? "Confirmed." : "Saved." });
    } catch (error) {
      setMessage({
        tone: "bad",
        text: error instanceof Error ? error.message : "Could not save the tee time.",
      });
    } finally {
      setSaving(false);
    }
  }

  /**
   * Saving on the tick itself. On a phone the per-row Save can be below the fold, so the checkbox
   * must not look saved while only the browser session holds the change. A refused write puts the
   * tick back and says why inline.
   */
  async function toggleConfirmed(next: boolean) {
    if (saving) return;
    const previous = confirmed;
    const resolved = resolveAssignment(teeTime.trim(), startHole.trim(), next);
    if ("error" in resolved) {
      setMessage({ tone: "bad", text: resolved.error });
      return;
    }
    setMessage(null);
    setConfirmed(next);
    setSaving(true);
    try {
      await onSave(resolved.assignment);
      setMessage({ tone: "ok", text: next ? "Confirmed." : "Confirmation removed." });
    } catch (error) {
      setConfirmed(previous);
      setMessage({
        tone: "bad",
        text:
          error instanceof Error
            ? error.message
            : "Could not change the confirmation. The tick was put back.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>
        <b>{player.name}</b>
        {entry.role === "guest" && <span className="pill info ml-1.5">Guest</span>}
      </td>
      <td className="num">{fmtIndex(entry.frozen.index)}</td>
      <td>
        <span className="pill">{entry.role}</span>
      </td>
      <td>
        <span className="pill">{sessionLabel ?? "—"}</span>
      </td>
      <td>
        <input
          type="time"
          value={teeTime}
          disabled={saving}
          className="text-[16px] md:text-sm"
          aria-label={`Tee time for ${player.name} on ${day.label}`}
          onChange={(e) => {
            setTeeTime(e.target.value);
            setMessage(null);
          }}
        />
      </td>
      <td>
        <input
          type="number"
          min={1}
          max={courseHoles}
          inputMode="numeric"
          value={startHole}
          disabled={saving}
          aria-label={`Start hole for ${player.name} on ${day.label}`}
          className="w-20 text-[16px] md:text-sm"
          onChange={(e) => {
            setStartHole(e.target.value);
            setMessage(null);
          }}
        />
      </td>
      <td>
        {/* The box itself is small; the label gives it a 44px thumb target on a phone. */}
        <label className="grid min-h-11 min-w-11 cursor-pointer place-items-center">
          <input
            type="checkbox"
            className="size-5"
            checked={confirmed}
            disabled={saving}
            aria-label={`Confirm the tee time for ${player.name} on ${day.label}`}
            onChange={(e) => void toggleConfirmed(e.target.checked)}
          />
        </label>
      </td>
      {/* Optional: a caddie is never needed to time, hole or confirm a player, so the column sits
          after the confirmation and says so. Empty is a normal, finished state. */}
      <td>
        <select
          value={caddieId}
          disabled={caddieSaving}
          title="Optional. A player can be timed and confirmed without a caddie."
          aria-label={`Caddie for ${player.name} on ${day.label} (optional)`}
          className="w-36 text-[16px] md:text-sm"
          onChange={async (e) => {
            const next = e.target.value;
            setCaddieId(next);
            setCaddieSaving(true);
            setMessage(null);
            try {
              await onAssignCaddie(next || null);
              setMessage({ tone: "ok", text: next ? "Caddie assigned." : "Caddie cleared." });
            } catch (error) {
              setCaddieId(entry.caddieByDay?.[day.dayNumber]?.caddieId ?? "");
              setMessage({
                tone: "bad",
                text: error instanceof Error ? error.message : "Could not assign the caddie.",
              });
            } finally {
              setCaddieSaving(false);
            }
          }}
        >
          <option value="">None</option>
          {caddies.map((caddie) => (
            <option key={caddie.id} value={caddie.id}>
              {caddie.fullName}
              {caddie.nickname ? ` (${caddie.nickname})` : ""}
            </option>
          ))}
        </select>
      </td>
      <td>
        <span className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="primary"
            size="sm"
            className="min-h-11 md:min-h-0"
            disabled={saving}
            onClick={() => void save()}
          >
            <Check aria-hidden="true" /> {saving ? "Saving…" : "Save"}
          </Button>
          {(saved?.teeTime || saved?.startHole) && (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 md:min-h-0"
              disabled={saving}
              title="Clear the time and hole for this day"
              onClick={() =>
                void save({ teeTime: null, startHole: null, wave: null, confirmed: false })
              }
            >
              <RotateCcw aria-hidden="true" /> Clear
            </Button>
          )}
          {message && (
            <span
              className={`hint ${message.tone === "bad" ? "!text-danger" : ""}`}
              role={message.tone === "bad" ? "alert" : "status"}
            >
              {message.tone === "bad" ? (
                <CircleAlert className="inline size-3.5" />
              ) : (
                <Clock className="inline size-3.5" />
              )}{" "}
              {message.text}
            </span>
          )}
        </span>
      </td>
    </tr>
  );
}
