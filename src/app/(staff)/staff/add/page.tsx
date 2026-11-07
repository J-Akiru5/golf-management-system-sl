"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useStaffDay } from "@/components/staff/day-context";
import styles from "@/components/staff/staff.module.css";
import { useToast } from "@/components/ui/toast";
import type { RegistrationEntry } from "@/lib/data/types";
import { placeWalkUp } from "@/lib/staff/place";
import { useDesk } from "@/lib/store/desk-store";

/**
 * A walk-up: somebody at the club who never sent an entry. Two paths, both short: pick a player
 * already in the directory, or add a guest by name. Then the days and the session.
 *
 * The entry is written by the same registration function the desk uses. A player the routing rules
 * cannot place is left for review; nothing is defaulted here.
 */
export default function StaffAddPage() {
  const { tournament, players, entries, adapters, dispatch, draw, classifyDraft } = useDesk();
  const { days, day, dayIndex, dayCount } = useStaffDay();
  const toast = useToast();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [guestFirst, setGuestFirst] = useState("");
  const [guestLast, setGuestLast] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestMode, setGuestMode] = useState(false);
  const [chosenDays, setChosenDays] = useState<number[]>(day ? [day.number] : []);
  const [session, setSession] = useState<"AM" | "PM">("AM");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const alreadyIn = useMemo(() => new Set(entries.map((entry) => entry.playerId)), [entries]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return players
      .filter((player) => !player.deletedAt && player.active !== false)
      .filter((player) => !alreadyIn.has(player.id))
      .filter((player) => (needle === "" ? true : player.name.toLowerCase().includes(needle)))
      .slice(0, 8);
  }, [players, alreadyIn, query]);

  const selected = players.find((player) => player.id === playerId) ?? null;

  function toggleDay(number: number) {
    setChosenDays((current) =>
      current.includes(number)
        ? current.filter((value) => value !== number)
        : [...current, number].sort((a, b) => a - b),
    );
  }

  async function save() {
    setError("");
    if (!tournament) {
      setError("No event is selected.");
      return;
    }
    if (chosenDays.length === 0) {
      setError("Pick at least one playing day.");
      return;
    }
    setBusy(true);
    try {
      let targetId = playerId;
      let role: "member" | "guest" = "member";
      let target = selected;
      if (guestMode) {
        const first = guestFirst.trim();
        const last = guestLast.trim();
        if (first === "" || last === "") {
          setError("A guest needs a first and last name.");
          setBusy(false);
          return;
        }
        const created = adapters.players.add({
          firstName: first,
          lastName: last,
          homeCourse: null,
          contactNumber: guestPhone.trim() === "" ? null : guestPhone.trim(),
          email: null,
          ngapId: null,
        });
        await created.saved;
        targetId = created.id;
        target = created;
        role = "guest";
      } else if (!targetId || !target) {
        setError("Pick a player, or switch to a new guest.");
        setBusy(false);
        return;
      }

      const entry = adapters.registrations.add(tournament.id, {
        playerId: targetId,
        role,
        sponsor: null,
        shirt: null,
        teePreferences: {},
        selectedDays: chosenDays,
        declaredWshId: null,
        declaredWshHandicap: null,
        extra: {},
        paymentStatus: "pending",
      });
      await (entry as RegistrationEntry & { saved?: Promise<void> }).saved;
      const sessions = Object.fromEntries(chosenDays.map((number) => [number, session])) as Record<
        number,
        "AM" | "PM"
      >;
      await adapters.registrations.setDays(entry.id, chosenDays, sessions);

      // The entry alone is not a place on the board. Classify the player with the desk's own rules,
      // then put them in a group of the same class and session that has an open place. When there
      // is no honest place, save the review flag so staff see it and the desk can act.
      const classification = classifyDraft({
        name: target.fullName ?? target.name,
        birthdate: target.birthdate,
        gender: target.gender,
        index: entry.frozen.index,
      });
      if (day && chosenDays.includes(day.number) && classification) {
        const placement = placeWalkUp({
          draw,
          registration: classification,
          session,
          dayIndex,
          dayCount,
          groupSize: tournament.config.groupSize,
        });
        if (placement.ok) {
          dispatch({
            type: "placeOnDraw",
            playerId: targetId,
            groupNumber: placement.groupNumber,
          });
          toast.push({
            title: `Walk-up added to group ${placement.groupNumber}`,
            detail: `${target.name} is in the ${session} session on ${day.label}. Their arrival tick is on the schedule.`,
            tone: "ok",
          });
          router.push("/staff/players");
          return;
        }

        await adapters.registrations.update(entry.id, {
          status: "needs_review",
          reasons: [placement.reason],
        });
        toast.push({
          title: "Saved, needs review",
          detail: `${placement.reason} The organizers place this player from the full desk.`,
          tone: "info",
        });
        router.push("/staff/players?filter=needs-review");
        return;
      }

      toast.push({
        title: "Walk-up saved",
        detail: `They are entered for ${chosenDays.map((number) => `Day ${number}`).join(", ")}. The organizers place them when that day's draw is checked.`,
        tone: "ok",
      });
      router.push("/staff/players");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
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
      <h1 className={styles.h1}>Add walk-up</h1>
      <p className={styles.sub}>For a player at the club who did not send an entry.</p>

      <div className={styles.tabs} role="tablist" aria-label="Who is the walk-up">
        <button
          type="button"
          role="tab"
          aria-selected={!guestMode}
          className={styles.tab}
          onClick={() => setGuestMode(false)}
        >
          In the directory
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={guestMode}
          className={styles.tab}
          onClick={() => setGuestMode(true)}
        >
          New guest
        </button>
      </div>

      {!guestMode ? (
        <>
          <div className={styles.search}>
            <input
              className={styles.input}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the club directory"
              aria-label="Search the player directory"
            />
          </div>
          {selected && (
            <p className={styles.notice}>
              Adding <b>{selected.name}</b>
              {selected.contactNumber ? ` · ${selected.contactNumber}` : ""}.{" "}
              <button
                type="button"
                className={styles.filter}
                onClick={() => setPlayerId("")}
                style={{ marginLeft: 8 }}
              >
                Change
              </button>
            </p>
          )}
          {!selected && (
            <ul className={styles.list}>
              {matches.map((player) => (
                <li key={player.id} className={styles.row}>
                  <button
                    type="button"
                    className={styles.rowMain}
                    onClick={() => setPlayerId(player.id)}
                  >
                    <b>{player.name}</b>
                    <span className={styles.rowMeta}>
                      <span>{player.contactNumber ?? "No phone on file"}</span>
                    </span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li>
                  <p className={styles.notice}>
                    Nobody in the directory matches. If the player is new to the club, add them as a
                    guest instead.
                  </p>
                </li>
              )}
            </ul>
          )}
        </>
      ) : (
        <div className={styles.card} style={{ display: "grid", gap: 10 }}>
          <label className={styles.sub} style={{ margin: 0 }}>
            First name
            <input
              className={styles.input}
              value={guestFirst}
              onChange={(event) => setGuestFirst(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label className={styles.sub} style={{ margin: 0 }}>
            Last name
            <input
              className={styles.input}
              value={guestLast}
              onChange={(event) => setGuestLast(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label className={styles.sub} style={{ margin: 0 }}>
            Phone (optional)
            <input
              className={styles.input}
              type="tel"
              value={guestPhone}
              onChange={(event) => setGuestPhone(event.target.value)}
              inputMode="tel"
            />
          </label>
        </div>
      )}

      <section className={styles.sectionHead}>
        <h2>Days</h2>
        <span>{chosenDays.length} chosen</span>
      </section>
      <div className={styles.filters} role="group" aria-label="Playing days">
        {days.map((entry) => (
          <button
            key={entry.number}
            type="button"
            className={styles.filter}
            aria-pressed={chosenDays.includes(entry.number)}
            onClick={() => toggleDay(entry.number)}
          >
            Day {entry.number} · {entry.label}
          </button>
        ))}
      </div>

      <section className={styles.sectionHead}>
        <h2>Session</h2>
        <span>applied to the chosen days</span>
      </section>
      <div className={styles.tabs} role="tablist" aria-label="Session">
        {(["AM", "PM"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={session === value}
            className={styles.tab}
            onClick={() => setSession(value)}
          >
            {value}
          </button>
        ))}
      </div>

      {error && (
        <p className={`${styles.notice} ${styles.noticeBad}`} role="alert">
          {error}
        </p>
      )}

      <p className={styles.notice} style={{ marginBottom: 12 }}>
        The organizers review the entry before it counts. A player the draw cannot place waits in
        review; the app never guesses a flight, tee or group.
      </p>

      <button type="button" className={styles.primary} disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Add the walk-up"}
      </button>
    </div>
  );
}
