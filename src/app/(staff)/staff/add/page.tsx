"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useStaffDay } from "@/components/staff/day-context";
import { StaffLoading } from "@/components/staff/StaffLoading";
import { useStaffToast } from "@/components/staff/StaffToast";
import styles from "@/components/staff/staff.module.css";
import type { RegistrationEntry } from "@/lib/data/types";
import { matchesText } from "@/lib/names";
import { fmtDayDate } from "@/lib/staff/day";
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
  const {
    tournament,
    players,
    entries,
    adapters,
    dispatch,
    draw,
    classifyDraft,
    status,
    error: deskError,
    offline,
    reload,
  } = useDesk();
  const { days, day, dayIndex, dayCount } = useStaffDay();
  const toast = useStaffToast();
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
    return players
      .filter((player) => !player.deletedAt && player.active !== false)
      .filter((player) => !alreadyIn.has(player.id))
      .filter((player) => matchesText(player.name, query))
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
    if (busy) return;
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

  if (status === "loading") {
    return <StaffLoading title="Add walk-up" label="Loading the player directory" />;
  }

  if (deskError && !offline) {
    return (
      <div className={styles.blockError} role="alert">
        <b>The desk did not load.</b>
        <p>{deskError}</p>
        <button type="button" className={styles.secondary} onClick={reload}>
          Try again
        </button>
      </div>
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
    <div className={styles.pageWithAction}>
      <h1 className={styles.h1}>Add walk-up</h1>
      <p className={styles.sub}>For a player at the club who did not send an entry.</p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className={styles.tabs} role="tablist" aria-label="Who is the walk-up">
          <button
            type="button"
            role="tab"
            aria-selected={!guestMode}
            className={styles.tab}
            onClick={() => setGuestMode(false)}
          >
            Club directory
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
            <label
              className={styles.sub}
              htmlFor="walkup-search"
              style={{ display: "block", margin: "0 0 6px" }}
            >
              Find a player in the club directory
            </label>
            <div className={styles.search}>
              <input
                id="walkup-search"
                className={styles.input}
                type="search"
                inputMode="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  event.currentTarget.blur();
                }}
                placeholder="Name, for example Cruz"
                autoComplete="off"
                enterKeyHint="search"
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
            {!selected && matches.length > 0 && (
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
              </ul>
            )}
            {!selected && matches.length === 0 && (
              <div className={styles.empty} style={{ marginBottom: 12 }}>
                <p className={styles.emptyTitle}>
                  {query.trim() === ""
                    ? "Everyone in the directory is already entered"
                    : "No player matches that name"}
                </p>
                <p>
                  {query.trim() === ""
                    ? "If this player is new to the club, add them as a guest."
                    : "Check the spelling, or add them as a new guest."}
                </p>
                <button
                  type="button"
                  className={`${styles.secondary} ${styles.emptyAction}`}
                  onClick={() => setGuestMode(true)}
                >
                  Add them as a guest
                </button>
              </div>
            )}
          </>
        ) : (
          <div className={styles.fieldGrid}>
            <label className={styles.sub} style={{ display: "grid", gap: 6, margin: 0 }}>
              First name
              <input
                className={styles.input}
                type="text"
                value={guestFirst}
                onChange={(event) => setGuestFirst(event.target.value)}
                autoComplete="given-name"
                enterKeyHint="next"
                style={{ width: "100%" }}
              />
            </label>
            <label className={styles.sub} style={{ display: "grid", gap: 6, margin: 0 }}>
              Last name
              <input
                className={styles.input}
                type="text"
                value={guestLast}
                onChange={(event) => setGuestLast(event.target.value)}
                autoComplete="family-name"
                enterKeyHint="next"
                style={{ width: "100%" }}
              />
            </label>
            <label className={styles.sub} style={{ display: "grid", gap: 6, margin: 0 }}>
              Phone (optional)
              <input
                className={styles.input}
                type="tel"
                inputMode="tel"
                value={guestPhone}
                onChange={(event) => setGuestPhone(event.target.value)}
                autoComplete="tel"
                enterKeyHint="done"
                style={{ width: "100%" }}
              />
            </label>
          </div>
        )}

        <section className={styles.sectionHead}>
          <h2>Days</h2>
          <span>{chosenDays.length} chosen</span>
        </section>
        {days.length === 0 ? (
          <p className={styles.notice}>
            This event has no playing days yet. The organizers set them from the full desk.
          </p>
        ) : (
          <div className={styles.filters} role="group" aria-label="Playing days">
            {days.map((entry) => (
              <button
                key={entry.number}
                type="button"
                className={styles.filter}
                aria-pressed={chosenDays.includes(entry.number)}
                onClick={() => toggleDay(entry.number)}
              >
                Day {entry.number} · {fmtDayDate(entry.date)}
              </button>
            ))}
          </div>
        )}

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

        <p className={styles.notice} style={{ marginBottom: 12 }}>
          The organizers review the entry before it counts. A player the draw cannot place waits in
          review; the app never guesses a flight, tee or group.
        </p>

        <div className={styles.stickyActionBar}>
          {error ? (
            <p
              className={`${styles.notice} ${styles.noticeBad}`}
              role="alert"
              style={{ margin: 0 }}
            >
              {error}
            </p>
          ) : null}
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? "Saving…" : "Add the walk-up"}
          </button>
        </div>
      </form>
    </div>
  );
}
