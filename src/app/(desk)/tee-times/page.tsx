"use client";

import { CalendarClock, Check, CircleAlert, Clock, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { fmtIso } from "@/lib/data/labels";
import { teeAssignmentProblem } from "@/lib/data/tee-time";
import type {
  Caddie,
  DayTeeAssignment,
  PlayerRecord,
  RegistrationEntry,
  TournamentDay,
} from "@/lib/data/types";
import { fmtIndex } from "@/lib/format";
import { useDesk } from "@/lib/store/desk-store";

/**
 * Tee times per playing day. Day selection and tee-time assignment are separate writes: this screen
 * only changes the confirmed time, start hole and confirmation flag for a day the player has already
 * selected. The database function checks the course's hole count and the day's start time.
 */
export default function TeeTimesPage() {
  const { tournament, days, entries, players, caddies, adapters, status } = useDesk();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const day = days.find((d) => d.dayNumber === selectedDay) ?? days[0] ?? null;

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
              subtitle={
                day.startTime
                  ? `Day starts at ${day.startTime}. Times before that are refused.`
                  : "No day start time is set. The event's first tee time is the floor."
              }
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
                          caddies={caddies.filter((caddie) => caddie.active)}
                          courseHoles={tournament.config.holes}
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
  caddies,
  courseHoles,
  onSave,
  onAssignCaddie,
}: {
  entry: RegistrationEntry;
  player: PlayerRecord;
  day: TournamentDay;
  caddies: Caddie[];
  courseHoles: number;
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
      return { error: "Give both a tee time and a start hole, or clear both." };
    }
    if (problem === "hole_range") {
      return { error: `The start hole must be between 1 and ${courseHoles}.` };
    }
    if (problem === "confirmed_needs_both") {
      return { error: "A confirmed time needs both fields." };
    }
    return {
      assignment: { teeTime: timeText || null, startHole: hole, confirmed: isConfirmed },
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
          {(saved?.teeTime || saved?.startHole) && (
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              title="Clear the time and hole for this day"
              onClick={() => void save({ teeTime: null, startHole: null, confirmed: false })}
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
