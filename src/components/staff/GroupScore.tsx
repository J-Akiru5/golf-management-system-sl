"use client";

import { ArrowLeft, CheckCircle2, ScanLine, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ScorecardScan } from "@/components/scoring/ScorecardScan";
import { useStaffDay } from "@/components/staff/day-context";
import { Stepper } from "@/components/staff/Stepper";
import styles from "@/components/staff/staff.module.css";
import { useStaffRows } from "@/components/staff/use-rows";
import { useToast } from "@/components/ui/toast";
import type { ScoringRoundView } from "@/lib/data/scoring";
import { fmtTime } from "@/lib/format";
import type { ScorecardScanApply } from "@/lib/scoring/scan/types";
import {
  blankScores,
  cardProgress,
  filledCount,
  type HoleScores,
  markerFor,
  nextBlankHole,
  reviewRows,
  stateLabel,
} from "@/lib/staff/score";
import { useDesk } from "@/lib/store/desk-store";

type Tab = "tap" | "scan";

interface ScanMeta {
  image: ScorecardScanApply["image"];
  extraction: ScorecardScanApply["extraction"];
  captureKey: string;
}

/**
 * The score sheet for one group.
 *
 * Tap scores: one hole at a time, one row per player, − and + only. Scan card: photograph the paper
 * card, review the reading with weak values flagged, then submit. Both paths end at the same review
 * step, and both submit through the desk's guarded card function. A card already in is shown as In
 * and never overwritten here: corrections are the desk's job.
 */
export function GroupScore({ groupId }: { groupId: string }) {
  const { tournament, scoring } = useDesk();
  const { day } = useStaffDay();
  const { schedule } = useStaffRows();
  const toast = useToast();

  const group = schedule.find((candidate) => candidate.id === groupId) ?? null;
  const players = useMemo(() => group?.players ?? [], [group]);

  const [view, setView] = useState<ScoringRoundView | null>(null);
  const [viewError, setViewError] = useState("");
  /** A round that does not exist is a different thing from one still loading. */
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("tap");
  const [scores, setScores] = useState<Record<string, HoleScores>>({});
  const [holeIndex, setHoleIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [scanMeta, setScanMeta] = useState<Record<string, ScanMeta>>({});
  const [captureKeys, setCaptureKeys] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submittedNow, setSubmittedNow] = useState<string[]>([]);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    if (fromUrl === "scan") setTab("scan");
  }, []);

  useEffect(() => {
    if (!tournament) return;
    let cancelled = false;
    scoring
      .loadRound(tournament.id)
      .then((next) => {
        if (cancelled) return;
        setView(next);
        setLoaded(true);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setViewError(reason instanceof Error ? reason.message : String(reason));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tournament, scoring]);

  const holes = view?.course.holes ?? [];
  const cards = view?.cards ?? [];
  const inPlayers = useMemo(() => {
    const set = new Set<string>();
    for (const card of cards) {
      if (card.status === "rejected" || card.status === "revoked") continue;
      set.add(card.playerId);
    }
    for (const playerId of submittedNow) set.add(playerId);
    return set;
  }, [cards, submittedNow]);

  const scoresFor = (playerId: string): HoleScores => scores[playerId] ?? blankScores(holes);

  const hole = holes[holeIndex] ?? null;
  const review = useMemo(() => reviewRows(holes, players, scores), [holes, players, scores]);
  const readyToSubmit = review.filter((row) => row.complete && !inPlayers.has(row.playerId));

  function setScore(playerId: string, holeNumber: number, value: number) {
    setScores((current) => ({
      ...current,
      [playerId]: { ...(current[playerId] ?? blankScores(holes)), [holeNumber]: value },
    }));
  }

  function applyScan(apply: ScorecardScanApply) {
    const next = { ...blankScores(holes) };
    for (const holeDefinition of holes) {
      const value = apply.strokes[holeDefinition.number];
      if (typeof value === "number") next[holeDefinition.number] = value;
    }
    setScores((current) => ({ ...current, [apply.playerId]: next }));
    setScanMeta((current) => ({
      ...current,
      [apply.playerId]: {
        image: apply.image,
        extraction: apply.extraction,
        captureKey: apply.captureKey,
      },
    }));
    setTab("tap");
    setReviewing(true);
    setSubmitError("");
    toast.push({
      title: "Card read",
      detail: "Check every value against the photo before submitting.",
      tone: "info",
    });
  }

  async function submit() {
    if (!tournament || !view) return;
    setSubmitError("");
    if (players.length < 2) {
      setSubmitError("A card needs a marker. This group has fewer than two players.");
      return;
    }
    if (readyToSubmit.length === 0) {
      setSubmitError("Nothing is ready yet. Fill every hole on at least one card.");
      return;
    }
    setSubmitting(true);
    let done = 0;
    try {
      let next: ScoringRoundView | null = null;
      for (const row of readyToSubmit) {
        setProgressLabel(`Submitting ${done + 1} of ${readyToSubmit.length}…`);
        const playerScores = scores[row.playerId] ?? {};
        const meta = scanMeta[row.playerId];
        const key = meta?.captureKey ?? captureKeys[row.playerId] ?? crypto.randomUUID();
        setCaptureKeys((current) => ({ ...current, [row.playerId]: key }));
        const scorerId =
          markerFor(players, row.playerId) ??
          players.find((player) => player.playerId !== row.playerId)?.playerId ??
          "";
        next = await scoring.submitCard(tournament.id, {
          playerId: row.playerId,
          scorerId,
          source: meta ? "upload" : "manual",
          entries: holes.map((definition) => ({
            hole: definition.number,
            strokes: Number(playerScores[definition.number] ?? definition.par),
            confidence: null,
            manuallyConfirmed: true,
          })),
          writtenTotal: row.total,
          captureKey: key,
          image: meta?.image ?? undefined,
          extraction: meta?.extraction ?? undefined,
        });
        done += 1;
        setSubmittedNow((current) => [...current, row.playerId]);
      }
      if (next) setView(next);
      setProgressLabel("");
      setReviewing(false);
      toast.push({
        title: `${done} ${done === 1 ? "card" : "cards"} submitted`,
        detail: "The desk still checks and approves them.",
        tone: "ok",
      });
    } catch (reason) {
      setSubmitError(reason instanceof Error ? reason.message : String(reason));
      setProgressLabel("");
    } finally {
      setSubmitting(false);
    }
  }

  if (!tournament) {
    return <p className={styles.notice}>No event is selected. Open the full desk first.</p>;
  }

  if (!group) {
    return (
      <div>
        <p className={styles.notice}>That group is not on {day?.label ?? "this day"}.</p>
        <Link className={styles.linkButton} href="/staff/schedule">
          Back to the schedule
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/staff/schedule/${group.id}`}
        className={styles.linkButton}
        style={{ marginBottom: 12 }}
      >
        <ArrowLeft aria-hidden="true" size={18} style={{ marginRight: 6 }} />
        Group {group.number}
      </Link>

      <h1 className={styles.h1}>Group {group.number}</h1>
      <p className={styles.sub}>
        {fmtTime(group.time)} · hole {group.startHole} · {group.flightName}
      </p>

      {viewError && (
        <p className={`${styles.notice} ${styles.noticeWarn}`} role="status">
          {viewError}
        </p>
      )}

      <div className={styles.tabs} role="tablist" aria-label="How to score">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "tap"}
          className={styles.tab}
          onClick={() => setTab("tap")}
        >
          Tap scores
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "scan"}
          className={styles.tab}
          onClick={() => setTab("scan")}
        >
          <ScanLine aria-hidden="true" size={18} style={{ marginRight: 6 }} />
          Scan card
        </button>
      </div>

      {!view ? (
        loaded ? (
          <p className={`${styles.notice} ${styles.noticeWarn}`} role="status">
            This event has no scoring round for the group yet, so no card can be submitted. The desk
            sets up the round and its holes first. Check-in and arrival still work.
          </p>
        ) : (
          <p className={styles.notice} role="status">
            Loading the round…
          </p>
        )
      ) : tab === "scan" ? (
        <>
          <p className={`${styles.notice} ${styles.noticeWarn}`}>
            Scanning needs a signal: the photo is uploaded to the club's storage and read there. In
            a dead spot, use <b>Tap scores</b> instead.
          </p>
          <ScorecardScan
            tournamentId={tournament.id}
            players={players}
            holes={holes}
            disabled={submitting}
            onApply={applyScan}
          />
        </>
      ) : reviewing ? (
        <section aria-label="Review the cards">
          <div className={styles.sectionHead}>
            <h2>Review</h2>
            <span>{readyToSubmit.length} ready</span>
          </div>
          <ul className={styles.list}>
            {review.map((row) => {
              const isIn = inPlayers.has(row.playerId);
              return (
                <li key={row.playerId} className={styles.row}>
                  <span className={styles.rowMain}>
                    <b>{row.playerName}</b>
                    <span className={styles.rowMeta}>
                      {isIn ? (
                        <span className={styles.pillOk}>In, ask the desk to change it</span>
                      ) : row.complete ? (
                        <span>
                          {row.total} strokes · {row.toPar >= 0 ? `+${row.toPar}` : row.toPar} vs
                          par
                        </span>
                      ) : (
                        <span className={styles.pillWarn}>{row.errors.join(" ")}</span>
                      )}
                      {scanMeta[row.playerId] && <span>From a photo</span>}
                    </span>
                  </span>
                  {!isIn && (
                    <button
                      type="button"
                      className={styles.rowAction}
                      onClick={() => {
                        setReviewing(false);
                        setHoleIndex(0);
                        setScores((current) => ({
                          ...current,
                          [row.playerId]: blankScores(holes),
                        }));
                      }}
                      aria-label={`Clear ${row.playerName}'s card and enter it again`}
                    >
                      <Undo2 aria-hidden="true" size={18} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {submitError && (
            <>
              <p className={`${styles.notice} ${styles.noticeBad}`} role="alert">
                {submitError}
              </p>
              <p className={styles.notice}>
                The scores are still on this phone. Fix what the message says, then submit again.
              </p>
            </>
          )}

          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.primary}
              disabled={submitting || readyToSubmit.length === 0}
              onClick={() => void submit()}
            >
              {submitting
                ? progressLabel || "Submitting…"
                : submitError && readyToSubmit.length > 0
                  ? `Retry submitting ${readyToSubmit.length}`
                  : `Submit ${readyToSubmit.length} ${readyToSubmit.length === 1 ? "card" : "cards"}`}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setReviewing(false)}
              disabled={submitting}
            >
              Back to the scores
            </button>
          </div>
          <p className={styles.notice} style={{ marginTop: 14 }}>
            Submitting sends the cards for the desk to check and approve. Nothing is published from
            this phone.
          </p>
        </section>
      ) : !hole ? (
        <p className={styles.notice}>This round has no holes yet. The desk sets up the course.</p>
      ) : (
        <section aria-label={`Hole ${hole.number}`}>
          <div className={styles.holeHead}>
            <b>{hole.number}</b>
            <span>
              Hole · Par {hole.par} · SI {hole.strokeIndex} · {holeIndex + 1} of {holes.length}
            </span>
          </div>
          <div className={styles.progress}>
            <div
              className={styles.progressBar}
              style={{ width: `${((holeIndex + 1) / holes.length) * 100}%` }}
            />
          </div>

          {players.map((player) => {
            const isIn = inPlayers.has(player.playerId);
            return (
              <div key={player.playerId} className={styles.playerRow}>
                <b>{player.playerName}</b>
                {isIn ? (
                  <span className={styles.pillOk}>{stateLabel("in")}</span>
                ) : (
                  <Stepper
                    label={player.playerName}
                    value={scoresFor(player.playerId)[hole.number] ?? null}
                    par={hole.par}
                    disabled={submitting}
                    onChange={(value) => setScore(player.playerId, hole.number, value)}
                  />
                )}
              </div>
            );
          })}

          <p className={styles.saving} style={{ marginTop: 10 }}>
            {players
              .filter((player) => !inPlayers.has(player.playerId))
              .map(
                (player) =>
                  `${player.playerName}: ${filledCount(holes, scoresFor(player.playerId))}/${holes.length}`,
              )
              .join(" · ")}
          </p>

          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                const nextBlank = nextBlankHole(
                  holes,
                  scoresFor(players[0]?.playerId ?? ""),
                  hole.number,
                );
                if (holeIndex === holes.length - 1 || nextBlank === null) {
                  setReviewing(true);
                  return;
                }
                setHoleIndex(holes.findIndex((definition) => definition.number === nextBlank));
              }}
            >
              {holeIndex === holes.length - 1 ? "Review the cards" : "Next hole"}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => (holeIndex === 0 ? setReviewing(true) : setHoleIndex(holeIndex - 1))}
              disabled={submitting}
            >
              {holeIndex === 0 ? "Review now" : "Previous hole"}
            </button>
          </div>

          <p className={styles.notice} style={{ marginTop: 14 }}>
            <CheckCircle2 aria-hidden="true" size={16} style={{ marginRight: 6 }} />
            {cardProgress(holes, scoresFor(players[0]?.playerId ?? "")).filled} of {holes.length}{" "}
            holes filled on the first card. Every player's card is submitted from the review step.
          </p>
        </section>
      )}
    </div>
  );
}
