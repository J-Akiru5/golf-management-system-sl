"use client";

import { CalendarClock, Check, CircleAlert, Clock, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { fmtIso } from "@/lib/data/labels";
import { daySessionSummary, sessionLabelForTime } from "@/lib/data/sessions";
import {
  teeAssignmentProblem,
  type WaveStart,
  waveCountForField,
  wavePosition,
  waveProblem,
  waveStartTimes,
} from "@/lib/data/tee-time";
import type {
  Caddie,
  DayTeeAssignment,
  PlayerRecord,
  RegistrationEntry,
  TournamentDay,
} from "@/lib/data/types";
import { fmtIndex, fmtTime } from "@/lib/format";
import { useDesk } from "@/lib/store/desk-store";
import { cn } from "@/lib/ui/cn";

/**
 * Tee times per playing day. Day selection and tee-time assignment are separate writes: this screen
 * only changes the confirmed time, start hole and confirmation flag for a day the player has already
 * selected. The database function checks the course's hole count and the day's start time.
 */
export default function TeeTimesPage() {
  const { tournament, days, entries, players, caddies, adapters, status, state } = useDesk();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [batchTime, setBatchTime] = useState("");
  const [batchWave, setBatchWave] = useState("");
  const [batching, setBatching] = useState<"missing" | "all" | null>(null);
  const [batchMessage, setBatchMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(
    null,
  );
  const day = days.find((d) => d.dayNumber === selectedDay) ?? days[0] ?? null;
  // 0-based position, which is what the session defaults read: every day but the last runs a
  // morning and an afternoon, and the last day runs one tee time.
  const dayIndex = day
    ? Math.max(
        0,
        days.findIndex((d) => d.dayNumber === day.dayNumber),
      )
    : 0;

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
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
  const config = tournament.config;
  // The day's waves come from the three things that actually decide them: the field size (one group
  // on every hole fills a wave), the waves the draw used to keep flights whole, and any wave already
  // written on a player. The screen lists all of them, so two waves or seven are both fine.
  const drawnWaves = (state.boards[tournament.id]?.draw ?? [])
    .map((group) => wavePosition(group.wave))
    .filter((value): value is number => value !== null);
  const savedWaves = rows
    .map(({ entry }) => wavePosition(day ? entry.dayTee?.[day.dayNumber]?.wave : null))
    .filter((value): value is number => value !== null);
  const waveCount = Math.max(
    1,
    waveCountForField(rows.length, config.holes, config.groupSize),
    ...drawnWaves,
    ...savedWaves,
  );
  const waves =
    config.startFormat === "shotgun"
      ? waveStartTimes(config.firstTeeTime, config.waveGapMinutes, waveCount)
      : [];
  const chosenTime = batchTime || config.firstTeeTime;

  /**
   * Writes one wave time to the day, in small parallel batches.
   *
   * "missing" fills only players with no time yet, which is the normal start of a shotgun day.
   * "all" overwrites every time but keeps each player's start hole and confirmation, so a wave
   * moved from 06:30 to 12:30 does not lose the work already done on holes.
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
          await adapters.registrations.assignDayTee(row.entry.id, day.dayNumber, {
            teeTime: time,
            startHole: existing?.startHole ?? null,
            wave: batchWave || existing?.wave || null,
            confirmed: Boolean(existing?.confirmed && existing.startHole),
          });
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
            text: `Set ${time}${batchWave ? ` in wave ${batchWave}` : ""} for ${saved} player${saved === 1 ? "" : "s"}. Their start holes come from the draw; a time can be confirmed once its hole is set.`,
          },
    );
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

      {days.length === 0 ? (
        <div className="notice warn" role="status">
          This event has no playing days. Save the event dates in Settings first.
        </div>
      ) : (
        <>
          <div className="seg" role="tablist" aria-label="Playing day">
            {days.map((item) => {
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
              subtitle={`${daySessionSummary(dayIndex, days.length)}. ${
                day.startTime
                  ? `The day opens at ${day.startTime}, and times before that are refused.`
                  : "No day start time is set, so the event's first tee time is the floor."
              }`}
            >
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

              {config.startFormat === "shotgun" && rows.length > 0 && (
                <div className="grid gap-3 rounded-[12px] border border-line bg-surface-sunken p-3">
                  <div>
                    <b className="text-[14px]">One tee time for the whole day</b>
                    <p className="hint mt-0.5">
                      A shotgun wave sends every player off at once. Wave times come from the event
                      settings: first tee {fmtTime(config.firstTeeTime)}, then every{" "}
                      {config.waveGapMinutes} minutes. This day needs {waveCount}{" "}
                      {waveCount === 1 ? "wave" : "waves"} for {rows.length} players.{" "}
                      <Link href="/setup#start" className="underline">
                        Change them in Settings
                      </Link>
                      . Start holes stay with the draw, so a batch time is saved unconfirmed.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    {waves.map((wave) => (
                      <button
                        key={wave.wave}
                        type="button"
                        className={cn(
                          "btn small",
                          chosenTime === wave.time && batchWave === wave.wave ? "gold" : "ghost",
                        )}
                        aria-pressed={chosenTime === wave.time && batchWave === wave.wave}
                        onClick={() => {
                          setBatchTime(wave.time);
                          setBatchWave(wave.wave);
                          setBatchMessage(null);
                        }}
                      >
                        Wave {wave.wave} · {wave.time}
                      </button>
                    ))}
                    <label className="field w-36">
                      <span>Batch time</span>
                      <input
                        type="time"
                        value={chosenTime}
                        disabled={batching !== null}
                        onChange={(event) => {
                          setBatchTime(event.target.value);
                          setBatchMessage(null);
                        }}
                      />
                    </label>
                    <Button
                      variant="primary"
                      size="sm"
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
                      disabled={batching !== null}
                      onClick={() => void applyBatch("all")}
                    >
                      {batching === "all" ? "Overwriting…" : `Overwrite all ${rows.length}`}
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
                        <th>Wave</th>
                        <th>Session</th>
                        <th>Tee time</th>
                        <th>Start hole</th>
                        <th>Caddie</th>
                        <th>Confirmed</th>
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
                          dayIndex={dayIndex}
                          dayCount={days.length}
                          caddies={caddies.filter((caddie) => caddie.active)}
                          courseHoles={tournament.config.holes}
                          waves={waves}
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
        </>
      )}
    </div>
  );
}

function TeeRow({
  entry,
  player,
  day,
  dayIndex,
  dayCount,
  caddies,
  courseHoles,
  waves,
  onSave,
  onAssignCaddie,
}: {
  entry: RegistrationEntry;
  player: PlayerRecord;
  day: TournamentDay;
  /** 0-based day position, used only to name the session. */
  dayIndex: number;
  dayCount: number;
  caddies: Caddie[];
  courseHoles: number;
  /** The day's waves, from the field size and the draw. A player may sit in any of them. */
  waves: WaveStart[];
  onSave: (assignment: DayTeeAssignment) => Promise<void>;
  onAssignCaddie: (caddieId: string | null) => Promise<void>;
}) {
  const saved = entry.dayTee?.[day.dayNumber];
  const [teeTime, setTeeTime] = useState(saved?.teeTime ?? "");
  const [startHole, setStartHole] = useState(saved?.startHole ? String(saved.startHole) : "");
  const [wave, setWave] = useState(saved?.wave ?? "");
  const [confirmed, setConfirmed] = useState(saved?.confirmed ?? false);
  // A wave already on this player stays selectable even if the field now needs fewer waves.
  const waveOptions = [...new Set([...waves.map((item) => item.wave), ...(wave ? [wave] : [])])];
  const [caddieId, setCaddieId] = useState(entry.caddieByDay?.[day.dayNumber]?.caddieId ?? "");
  const [saving, setSaving] = useState(false);
  const [caddieSaving, setCaddieSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  /**
   * The one place that turns the row's fields into a write. Used by Save, by Clear, and by the
   * confirmation checkbox, so all three refuse the same invalid combinations with the same words.
   */
  function resolveAssignment(
    timeText: string,
    holeText: string,
    isConfirmed: boolean,
    waveText: string,
  ): { assignment: DayTeeAssignment } | { error: string } {
    const hole = holeText ? Number(holeText) : null;
    if (waveProblem(waveText || null) === "wave_format") {
      return { error: "A wave is one letter, for example A." };
    }
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
        wave: waveText ? waveText.trim().toUpperCase() : null,
        confirmed: isConfirmed,
      },
    };
  }

  async function save(next?: DayTeeAssignment) {
    setMessage(null);
    const resolved = next
      ? { assignment: next }
      : resolveAssignment(teeTime.trim(), startHole.trim(), confirmed, wave);
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
      setWave(assignment.wave ?? "");
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
    const resolved = resolveAssignment(teeTime.trim(), startHole.trim(), next, wave);
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
        <select
          value={wave}
          disabled={saving}
          aria-label={`Wave for ${player.name} on ${day.label}`}
          className="w-24"
          onChange={(e) => {
            setWave(e.target.value);
            setMessage(null);
          }}
        >
          <option value="">No wave</option>
          {waveOptions.map((letter) => (
            <option key={letter} value={letter}>
              Wave {letter}
            </option>
          ))}
        </select>
      </td>
      <td>
        <span className="pill">
          {sessionLabelForTime(teeTime || null, dayIndex, dayCount) ?? "—"}
        </span>
      </td>
      <td>
        <input
          type="time"
          value={teeTime}
          disabled={saving}
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
          className="w-20"
          onChange={(e) => {
            setStartHole(e.target.value);
            setMessage(null);
          }}
        />
      </td>
      <td>
        <select
          value={caddieId}
          disabled={caddieSaving}
          aria-label={`Caddie for ${player.name} on ${day.label}`}
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
          <option value="">No caddie</option>
          {caddies.map((caddie) => (
            <option key={caddie.id} value={caddie.id}>
              {caddie.fullName}
              {caddie.nickname ? ` (${caddie.nickname})` : ""}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={saving}
          aria-label={`Confirm the tee time for ${player.name} on ${day.label}`}
          onChange={(e) => void toggleConfirmed(e.target.checked)}
        />
      </td>
      <td>
        <span className="flex flex-wrap items-center gap-1.5">
          <Button variant="primary" size="sm" disabled={saving} onClick={() => void save()}>
            <Check aria-hidden="true" /> {saving ? "Saving…" : "Save"}
          </Button>
          {(saved?.teeTime || saved?.startHole || saved?.wave) && (
            <Button
              variant="ghost"
              size="sm"
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
