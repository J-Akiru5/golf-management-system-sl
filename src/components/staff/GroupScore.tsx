"use client";

import { ArrowLeft, CheckCircle2, Hand, ScanLine, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ScorecardScan } from "@/components/scoring/ScorecardScan";
import { useStaffDay } from "@/components/staff/day-context";
import { useStaffToast } from "@/components/staff/StaffToast";
import { Stepper } from "@/components/staff/Stepper";
import ui from "@/components/staff/score-ui.module.css";
import styles from "@/components/staff/staff.module.css";
import { useStaffRows } from "@/components/staff/use-rows";
import type { ScoringRoundView } from "@/lib/data/scoring";
import { fmtTime } from "@/lib/format";
import { scanReview, WEAK_CONFIDENCE } from "@/lib/scoring/scan/review";
import type { ScorecardScanApply } from "@/lib/scoring/scan/types";
import {
  blankScores,
  cardProgress,
  filledCount,
  type HoleScores,
  markerFor,
  nextBlankHole,
  parseScannedScores,
  reviewRows,
  stateLabel,
} from "@/lib/staff/score";
import { useDesk } from "@/lib/store/desk-store";

type Tab = "tap" | "scan";

interface ScanMeta {
  image: ScorecardScanApply["image"];
  extraction: ScorecardScanApply["extraction"];
  captureKey: string;
  confidence: Record<number, number | null>;
}

/**
 * The score sheet for one group.
 *
 * Tap scores: one hole at a time, one row per player, − and + only. Scan card: photograph the paper
 * card, review the reading with weak values flagged, then submit. Both paths end at the same review
 * step, and both submit through the desk's guarded card function. A card already in is shown as In
 * and never overwritten here: corrections are the desk's job.
 *
 * The hole band is deliberately short and the primary action sits in a sticky bar above the tab
 * bar, so a volunteer sees the first player row without scrolling and never has to hunt for the
 * next action with a thumb.
 */
export function GroupScore({ groupId }: { groupId: string }) {
  const { tournament, scoring } = useDesk();
  const { day } = useStaffDay();
  const { schedule } = useStaffRows();
  const toast = useStaffToast();

  const group = schedule.find((candidate) => candidate.id === groupId) ?? null;
  const players = useMemo(() => group?.players ?? [], [group]);

  const [view, setView] = useState<ScoringRoundView | null>(null);
  const [viewError, setViewError] = useState("");
  /** A round that does not exist is a different thing from one still loading. */
  const [loaded, setLoaded] = useState(false);
  /** A rejected read is retried by bumping this, not by reloading the page. */
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("tap");
  const [scores, setScores] = useState<Record<string, HoleScores>>({});
  const [holeIndex, setHoleIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [scanMeta, setScanMeta] = useState<Record<string, ScanMeta>>({});
  const [scanPlayerId, setScanPlayerId] = useState<string | null>(null);
  const [captureKeys, setCaptureKeys] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submittedNow, setSubmittedNow] = useState<string[]>([]);
  /** The in-place confirmation after a save. */
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    if (fromUrl === "scan") setTab("scan");
  }, []);

  useEffect(() => {
    if (!tournament) return;
    let cancelled = false;
    setLoaded(false);
    setViewError("");
    scoring
      .loadRound(tournament.id, day?.number ?? null)
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
  }, [tournament, scoring, loadAttempt, day?.number]);

  const holes = view?.course.holes ?? [];
  const cards = view?.cards ?? [];
  const inPlayers = useMemo(() => {
    const set = new Set<string>();
    for (const card of cards) {
      if (card.status === "rejected" || card.status === "revoked" || card.status === "superseded") {
        continue;
      }
      set.add(card.playerId);
    }
    for (const playerId of submittedNow) set.add(playerId);
    return set;
  }, [cards, submittedNow]);

  const scoresFor = (playerId: string): HoleScores => scores[playerId] ?? blankScores(holes);

  const hole = holes[holeIndex] ?? null;
  const review = useMemo(() => reviewRows(holes, players, scores), [holes, players, scores]);
  const readyToSubmit = review.filter((row) => row.complete && !inPlayers.has(row.playerId));
  const scanPlayer = players.find((player) => player.playerId === scanPlayerId) ?? null;
  const scanMetaCurrent = scanPlayerId ? (scanMeta[scanPlayerId] ?? null) : null;
  const scanCheck = useMemo(() => {
    if (!scanPlayerId || !scanMetaCurrent) return null;
    const strings: Record<number, string> = {};
    for (const holeDefinition of holes) {
      const value = scores[scanPlayerId]?.[holeDefinition.number];
      strings[holeDefinition.number] = value === null || value === undefined ? "" : String(value);
    }
    return scanReview(holes, strings, scanMetaCurrent.confidence);
  }, [holes, scanMetaCurrent, scanPlayerId, scores]);
  const playersWithCard = players.filter((player) => inPlayers.has(player.playerId));
  const playersToScan = players.filter((player) => !inPlayers.has(player.playerId));

  function setScore(playerId: string, holeNumber: number, value: number) {
    setScores((current) => ({
      ...current,
      [playerId]: { ...(current[playerId] ?? blankScores(holes)), [holeNumber]: value },
    }));
    // A hand correction is a person checking that cell against the paper card. The reader's doubt
    // is replaced by that check, for this hole only; every other weak read stays flagged.
    setScanMeta((current) => {
      const meta = current[playerId];
      if (!meta) return current;
      return {
        ...current,
        [playerId]: { ...meta, confidence: { ...meta.confidence, [holeNumber]: 1 } },
      };
    });
  }

  function applyScan(apply: ScorecardScanApply) {
    const next = parseScannedScores(holes, apply.strokes);
    setScores((current) => ({ ...current, [apply.playerId]: next }));
    setScanMeta((current) => ({
      ...current,
      [apply.playerId]: {
        image: apply.image,
        extraction: apply.extraction,
        captureKey: apply.captureKey,
        confidence: apply.confidence,
      },
    }));
    setTab("tap");
    setScanPlayerId(apply.playerId);
    setHoleIndex(0);
    setReviewing(false);
    setSubmitError("");
    setSaveStatus("");
    toast.push({
      title: "Card read",
      detail: "Amber cells need a check against the photo. Tap one to fix it.",
      tone: "info",
    });
  }

  async function submit() {
    if (!tournament || !view) return;
    setSubmitError("");
    setSaveStatus("");
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
        setProgressLabel(`Saving card ${done + 1} of ${readyToSubmit.length}…`);
        const playerScores = scores[row.playerId] ?? {};
        const meta = scanMeta[row.playerId];
        const key = meta?.captureKey ?? captureKeys[row.playerId] ?? crypto.randomUUID();
        setCaptureKeys((current) => ({ ...current, [row.playerId]: key }));
        const scorerId =
          markerFor(players, row.playerId) ??
          players.find((player) => player.playerId !== row.playerId)?.playerId ??
          "";
        next = await scoring.submitCard(
          tournament.id,
          {
            playerId: row.playerId,
            scorerId,
            source: meta ? "upload" : "manual",
            entries: holes.map((definition) => {
              const strokes = playerScores[definition.number];
              if (typeof strokes !== "number") {
                throw new Error(`${row.playerName} still has a blank hole.`);
              }
              const confidence = meta ? (meta.confidence[definition.number] ?? null) : null;
              return {
                hole: definition.number,
                strokes,
                confidence,
                // A high-confidence read, or a cell the volunteer corrected by hand, is checked.
                // An untouched weak read goes to the desk still unconfirmed, never silently trusted.
                manuallyConfirmed: meta
                  ? confidence !== null && confidence >= WEAK_CONFIDENCE
                  : true,
              };
            }),
            writtenTotal: row.total,
            captureKey: key,
            image: meta?.image ?? undefined,
            extraction: meta?.extraction ?? undefined,
          },
          day?.number ?? null,
        );
        done += 1;
        setSubmittedNow((current) => [...current, row.playerId]);
      }
      if (next) setView(next);
      setProgressLabel("");
      setReviewing(false);
      setSaveStatus(`${done} ${done === 1 ? "card" : "cards"} saved and sent to the desk.`);
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

  const withActionBar = Boolean(view) && tab === "tap" && (reviewing || hole !== null);

  return (
    <div className={withActionBar ? ui.sheetPage : undefined}>
      <div className={ui.head}>
        <Link
          href={`/staff/schedule/${group.id}`}
          className={ui.back}
          aria-label={`Back to group ${group.number}`}
        >
          <ArrowLeft aria-hidden="true" size={20} />
        </Link>
        <div className={ui.headText}>
          <h1 className={ui.title}>Group {group.number}</h1>
          <p className={ui.meta}>
            {fmtTime(group.time)} · hole {group.startHole} · {group.flightName}
          </p>
        </div>
      </div>

      {viewError && (
        <div className={styles.blockError} role="alert">
          <b>The round did not load.</b>
          <p>{viewError}</p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setLoadAttempt((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      )}

      <div className={styles.tabs} role="tablist" aria-label="How to score">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "tap"}
          className={styles.tab}
          onClick={() => setTab("tap")}
        >
          <Hand aria-hidden="true" />
          Tap scores
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "scan"}
          className={styles.tab}
          onClick={() => setTab("scan")}
        >
          <ScanLine aria-hidden="true" />
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
          <div aria-label="Loading the round" role="status">
            <div className={`${styles.skeleton} ${ui.skeletonBand}`} />
            <div className={styles.skeletonStack}>
              {[0, 1, 2].map((row) => (
                <div key={row} className={styles.skeletonRow}>
                  <span className={styles.skeleton} />
                  <span className={styles.skeleton} />
                </div>
              ))}
            </div>
          </div>
        )
      ) : tab === "scan" ? (
        <>
          <p className={`${styles.notice} ${styles.noticeWarn}`}>
            Scanning needs a signal: the photo is uploaded to the club's storage and read there. In
            a dead spot, use <b>Tap scores</b> instead.
          </p>
          {playersWithCard.length > 0 && (
            <p className={`${styles.notice} ${styles.noticeWarn}`} role="status">
              <b>In, ask the desk:</b>{" "}
              {playersWithCard.map((player) => player.playerName).join(", ")}. A card already in is
              never replaced from this phone.
            </p>
          )}
          {playersToScan.length === 0 ? (
            <p className={styles.notice}>
              Every player in this group has a card in. Ask the desk to change or correct one.
            </p>
          ) : (
            <ScorecardScan
              tournamentId={tournament.id}
              players={playersToScan}
              holes={holes}
              disabled={submitting}
              onApply={applyScan}
            />
          )}
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
                        <span className={styles.pillOk}>In, ask the desk</span>
                      ) : row.complete ? (
                        <span>
                          {row.total} strokes · {row.toPar >= 0 ? `+${row.toPar}` : row.toPar} vs
                          par
                        </span>
                      ) : (
                        <span className={styles.pillWarn}>{row.errors.join(" ")}</span>
                      )}
                      {scanMeta[row.playerId] && <span>From a photo</span>}
                      {!isIn &&
                        (() => {
                          const markerId = markerFor(players, row.playerId);
                          const marker = players.find((player) => player.playerId === markerId);
                          return marker ? <span>Marked by {marker.playerName}</span> : null;
                        })()}
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
                <b>Not saved.</b> {submitError}
              </p>
              <p className={styles.notice}>
                The scores are still on this phone. Nothing was sent and nothing is queued to send
                later. Fix what the message says, then retry.
              </p>
              <button
                type="button"
                className={styles.secondary}
                style={{ marginTop: 10 }}
                disabled={submitting || readyToSubmit.length === 0}
                onClick={() => void submit()}
              >
                Retry saving
              </button>
            </>
          )}

          <p className={styles.notice} style={{ marginTop: 14 }}>
            Submitting sends the cards for the desk to check and approve. Nothing is published from
            this phone.
          </p>
        </section>
      ) : !hole ? (
        <p className={styles.notice}>This round has no holes yet. The desk sets up the course.</p>
      ) : (
        <section aria-label={`Hole ${hole.number}`}>
          {scanCheck && scanPlayer && !inPlayers.has(scanPlayer.playerId) && (
            <div className={styles.scanReview}>
              <div className={styles.sectionHead}>
                <h2>Photo read · {scanPlayer.playerName}</h2>
                <span>
                  {scanCheck.filled} filled · {scanCheck.weak} to check · {scanCheck.blank} blank
                </span>
              </div>
              <p className={styles.hint}>
                Every hole is below. Amber cells came back weak or unreadable; tap one, then use the
                − and + buttons to correct it against the photo.
              </p>
              <div className={styles.scanGrid} role="group" aria-label="Scanned holes">
                {holes.map((definition, index) => {
                  const state = scanCheck.holes[definition.number];
                  const value = scoresFor(scanPlayer.playerId)[definition.number] ?? null;
                  return (
                    <button
                      key={definition.number}
                      type="button"
                      className={`${styles.scanCell} ${state === "check" ? styles.scanCellWeak : ""}`}
                      onClick={() => setHoleIndex(index)}
                      aria-label={`Hole ${definition.number}, ${value ?? "blank"}${
                        state === "check" ? ", check the photo" : ""
                      }`}
                    >
                      <span>H{definition.number}</span>
                      <b>{value ?? "–"}</b>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className={styles.secondary}
                style={{ marginTop: 10 }}
                onClick={() => setReviewing(true)}
              >
                Review totals
              </button>
            </div>
          )}

          <div className={ui.holeBand}>
            <b className={ui.holeNumber}>{hole.number}</b>
            <span className={ui.holeMeta}>
              Hole · Par {hole.par} · SI {hole.strokeIndex} · {holeIndex + 1} of {holes.length}
            </span>
          </div>
          <div className={ui.progress}>
            <div
              className={ui.progressBar}
              style={{ width: `${((holeIndex + 1) / holes.length) * 100}%` }}
            />
          </div>

          <div>
            {players.map((player) => {
              const isIn = inPlayers.has(player.playerId);
              return (
                <div key={player.playerId} className={ui.playerRow}>
                  <b className={ui.playerName} title={player.playerName}>
                    {player.playerName}
                  </b>
                  {isIn ? (
                    <span className={ui.playerState}>
                      <span className={styles.pillOk}>{stateLabel("in")}</span>
                    </span>
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
          </div>

          <p className={styles.saving} style={{ marginTop: 10 }}>
            {players
              .filter((player) => !inPlayers.has(player.playerId))
              .map(
                (player) =>
                  `${player.playerName}: ${filledCount(holes, scoresFor(player.playerId))}/${holes.length}`,
              )
              .join(" · ")}
          </p>

          <p className={styles.notice} style={{ marginTop: 14 }}>
            <CheckCircle2 aria-hidden="true" size={16} style={{ marginRight: 6 }} />
            {cardProgress(holes, scoresFor(players[0]?.playerId ?? "")).filled} of {holes.length}{" "}
            holes filled on the first card. Every player's card is submitted from the review step.
          </p>
        </section>
      )}

      {withActionBar && !reviewing && hole && (
        <div className={styles.stickyActionBar}>
          <button
            type="button"
            className={styles.primary}
            data-onboard="score-entry"
            onClick={() => {
              setSaveStatus("");
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
            onClick={() => {
              setSaveStatus("");
              if (holeIndex === 0) {
                setReviewing(true);
                return;
              }
              setHoleIndex(holeIndex - 1);
            }}
            disabled={submitting}
          >
            {holeIndex === 0 ? "Review now" : "Previous hole"}
          </button>
          {saveStatus ? (
            <p className={ui.barStatus} style={{ minHeight: 0 }} role="status">
              {saveStatus}
            </p>
          ) : null}
        </div>
      )}

      {withActionBar && reviewing && view && (
        <div className={styles.stickyActionBar}>
          {submitting || saveStatus ? (
            <p className={ui.barStatus} style={{ minHeight: 0 }} role="status">
              {submitting ? progressLabel || "Saving…" : saveStatus}
            </p>
          ) : null}
          <button
            type="button"
            className={styles.primary}
            data-onboard="score-entry"
            disabled={submitting || readyToSubmit.length === 0}
            onClick={() => void submit()}
          >
            {submitting
              ? "Saving…"
              : submitError && readyToSubmit.length > 0
                ? `Retry saving ${readyToSubmit.length}`
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
      )}
    </div>
  );
}
