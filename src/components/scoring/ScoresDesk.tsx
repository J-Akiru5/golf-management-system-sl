"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileJson,
  Flag,
  Pencil,
  RotateCcw,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { RoleGate } from "@/components/desk/RoleGate";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { OpenRoundPanel } from "@/components/scoring/OpenRoundPanel";
import { PlayerLink } from "@/components/scoring/PlayerLink";
import { ScorecardImportPanel } from "@/components/scoring/ScorecardImportPanel";
import { ScorecardWorkspace } from "@/components/scoring/ScorecardWorkspace";
import { ScoresSubnav, type ScoresTab } from "@/components/scoring/ScoresSubnav";
import { Button } from "@/components/ui/button";
import type { ClubRole } from "@/lib/auth/member";
import { type OpenRoundSnapshot, openRoundErrorMessage } from "@/lib/data/open-round";
import { canOpenPlayerProfile } from "@/lib/data/player-profile";
import type { OpenRoundInput, ScoringRoundView } from "@/lib/data/scoring";
import { fmtHcp, fmtIndex } from "@/lib/format";
import {
  type CardIssue,
  checkHandicapSnapshot,
  type HoleDefinition,
  reciprocalRotation,
  type Scorecard,
  type StandingsBoard,
  type StandingsRow,
  validateScorecard,
} from "@/lib/scoring";
import { classLabel } from "@/lib/scoring/class-label";
import { reviewScannedCard, type ScanReaderCell } from "@/lib/scoring/scan/review";
import type { ScorecardScanApply, ScorecardScanImage } from "@/lib/scoring/scan/types";
import {
  cardSignature,
  checkCardSubmission,
  createSubmitGate,
  readCardValues,
} from "@/lib/scoring/submission";
import { useDesk } from "@/lib/store/desk-store";

const DEMO_NOTICE =
  "Sample scoring preview. Cards, approvals, resolutions and standings live in this browser only and are not written to the database. The scoring schema and RPCs are applied; this screen is not wired to them yet.";

/** A manual card starts empty. A cell is only ever filled by a person or by the reader. */
function blankStrokes(holes: readonly HoleDefinition[]): Record<number, string> {
  return Object.fromEntries(holes.map((hole) => [hole.number, ""]));
}

function strokesFor(holes: readonly HoleDefinition[]): Record<number, string> {
  return Object.fromEntries(holes.map((hole) => [hole.number, String(hole.par)]));
}

function issueLabel(issues: CardIssue[]): string {
  const first = issues.find((issue) => issue.severity === "blocking") ?? issues[0];
  if (!first) return "Ready";
  return first.message;
}

export function ScoresDesk({ tab }: { tab: ScoresTab }) {
  const { member, tournament, scoring, status, drawDay } = useDesk();
  const router = useRouter();
  const tournamentId = tournament?.id ?? "";
  /** Every read and write names the playing day, so day 3 is never day 1. */
  const day = drawDay;
  const [view, setView] = useState<ScoringRoundView | null>(null);
  const [roundState, setRoundState] = useState<OpenRoundSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const interactionBusy = busy || importBusy;
  const [playerId, setPlayerId] = useState("");
  const [scorerId, setScorerId] = useState("");
  const [strokes, setStrokes] = useState<Record<number, string>>({});
  /** The total written on the paper card, when the desk chooses to record it. */
  const [writtenOnCard, setWrittenOnCard] = useState("");
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [resolutionDrafts, setResolutionDrafts] = useState<
    Record<string, { strokes: string; reason: string; pickedUp?: boolean }>
  >({});
  const [scanImage, setScanImage] = useState<ScorecardScanImage | null>(null);
  const [scanExtraction, setScanExtraction] = useState<ScorecardScanApply["extraction"]>(null);
  const [scanCaptureKey, setScanCaptureKey] = useState("");
  /** What the reader returned per hole, so the form can show read, weak, empty and changed cells. */
  const [scanReader, setScanReader] = useState<Record<number, ScanReaderCell>>({});
  /** The card being corrected. A correction is a new revision, never an edit of the old row. */
  const [editingCard, setEditingCard] = useState<Scorecard | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  /** Reused across retries, so a failed reason write cannot create a second revision. */
  const [editCaptureKey, setEditCaptureKey] = useState("");
  /** True while this screen is writing a card, so the button can say what it is doing. */
  const [submitting, setSubmitting] = useState(false);
  /** A plain sentence about a card that was already in, or a save that changed nothing. */
  const [submitNote, setSubmitNote] = useState("");
  /** What happened after the last save, kept in place so the form does not jump. */
  const [savedNote, setSavedNote] = useState("");
  /** A scanned card needs a person to tick that every flag was compared with the photo. */
  const [scanConfirmed, setScanConfirmed] = useState(false);
  /**
   * The capture key of a submission that failed, with the card it was for. A retry of the same card
   * reuses it, so a request that reached the database but came back as an error is not written twice.
   */
  const [pendingSubmit, setPendingSubmit] = useState<{ key: string; signature: string } | null>(
    null,
  );
  /** Answers on the same tick as the click, before React can disable the button. */
  const submitGate = useRef(createSubmitGate());
  /** The Review page hands a card back through ?card=…; apply it once when the round loads. */
  const queryApplied = useRef(false);

  const players = view?.players ?? [];
  const holes = view?.course.holes ?? [];
  const canEdit =
    status === "demo" ||
    member?.role === "owner" ||
    member?.role === "organizer" ||
    member?.role === "desk";
  // Demo has no auth at all (`member` is undefined); a signed-in account always has a role. The
  // profile link is only painted when the account may actually open a staff profile page.
  const profileRole = member === undefined ? undefined : (member?.role ?? null);
  const canOpenProfile = canOpenPlayerProfile(profileRole);
  const totalPar = holes.reduce((sum, hole) => sum + hole.par, 0);
  const selectedPlayer = players.find((player) => player.playerId === playerId) ?? null;
  const selectedScorer = players.find((player) => player.playerId === scorerId) ?? null;
  const editingPlayerName = editingCard
    ? (players.find((player) => player.playerId === editingCard.playerId)?.playerName ??
      editingCard.playerId)
    : "";
  const courseKey = view
    ? `${view.roundId}:${holes.map((hole) => `${hole.number}:${hole.par}:${hole.strokeIndex}`).join("|")}`
    : "";

  useEffect(() => {
    if (!tournamentId) return;
    let cancelled = false;
    setLoaded(false);
    setError(null);
    // The old day's round, cards and import preview must not stay on screen.
    setView(null);
    scoring
      .loadRound(tournamentId, day)
      .then((next) => {
        if (cancelled) return;
        setView(next);
        setLoaded(true);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scoring, tournamentId, day]);

  useEffect(() => {
    if (!tournamentId) return;
    let cancelled = false;
    setRoundState(null);
    scoring
      .loadOpenRoundState(tournamentId, day)
      .then((next) => {
        if (cancelled) return;
        setRoundState(next);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [scoring, tournamentId, day]);

  useEffect(() => {
    if (!view) return;
    setStrokes(blankStrokes(view.course.holes));
    setWrittenOnCard("");
    setEditingCard(null);
    setCorrectionReason("");
    setEditCaptureKey("");
    setScanReader({});
    setScanImage(null);
    setScanExtraction(null);
    setScanCaptureKey("");
    setScanConfirmed(false);
    setSubmitNote("");
    setSavedNote("");
    const first = view.players[0]?.playerId ?? "";
    const rotation = reciprocalRotation(view.players.map((player) => player.playerId));
    setPlayerId(first);
    setScorerId(
      rotation.find((assignment) => assignment.playerId === first)?.scorerId ??
        view.players[1]?.playerId ??
        "",
    );
    // Reset the entry form only when the round or its course changes, not after every approval.
  }, [courseKey]);

  useEffect(() => {
    if (!view || queryApplied.current) return;
    queryApplied.current = true;
    const params = new URLSearchParams(window.location.search);
    const cardId = params.get("card");
    const requestedPlayer = params.get("player");
    const card = cardId ? view.cards.find((candidate) => candidate.id === cardId) : null;
    if (card) {
      editCard(card);
      return;
    }
    if (requestedPlayer && view.players.some((player) => player.playerId === requestedPlayer)) {
      changePlayer(requestedPlayer);
    }
  }, [view]);

  const conflicts = useMemo(() => {
    if (!view) return [];
    return view.players.flatMap((player) =>
      player.canonical.holes
        .filter((hole) => hole.status === "conflict")
        .map((hole) => ({ playerId: player.playerId, playerName: player.playerName, hole })),
    );
  }, [view]);

  const writtenTotal = holes.reduce((sum, hole) => {
    const value = Number(strokes[hole.number]);
    return (
      sum + (Number.isInteger(value) && (strokes[hole.number] ?? "").trim() !== "" ? value : 0)
    );
  }, 0);

  const scan = useMemo(
    () => reviewScannedCard(holes, strokes, scanReader),
    [holes, strokes, scanReader],
  );
  const scanned = Object.keys(scanReader).length > 0;
  const cardValues = useMemo(() => readCardValues(holes, strokes), [holes, strokes]);
  /** A scanned card is not submitted until every empty cell is typed and the person has checked it. */
  const scanBlocked = scanned && (!scanConfirmed || scan.blankHoles.length > 0);

  async function run(action: () => Promise<ScoringRoundView | null>) {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) setView(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function openRound(input: OpenRoundInput) {
    setBusy(true);
    setError(null);
    try {
      const next = await scoring.openRound(tournamentId, input);
      setView(next);
      try {
        setRoundState(await scoring.loadOpenRoundState(tournamentId, day));
      } catch (reason) {
        setError(openRoundErrorMessage(reason instanceof Error ? reason.message : String(reason)));
      }
    } catch (reason) {
      setError(openRoundErrorMessage(reason instanceof Error ? reason.message : String(reason)));
    } finally {
      setBusy(false);
    }
  }

  function reloadRoundState() {
    void scoring
      .loadOpenRoundState(tournamentId, day)
      .then(setRoundState)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }

  function applyScan(apply: ScorecardScanApply) {
    const nextPlayer = apply.playerId;
    setPlayerId(nextPlayer);
    setWrittenOnCard("");
    if (Object.keys(apply.strokes).length > 0) {
      setStrokes((current) => ({ ...current, ...apply.strokes }));
    }
    if (nextPlayer === scorerId) {
      const rotation = reciprocalRotation(players.map((player) => player.playerId));
      setScorerId(
        rotation.find((assignment) => assignment.playerId === nextPlayer)?.scorerId ??
          players.find((player) => player.playerId !== nextPlayer)?.playerId ??
          "",
      );
    }
    // Keep the reader's own value beside its confidence. That is what lets the grid say "read",
    // "check", "empty" and "changed" instead of guessing from the value alone.
    const reader: Record<number, ScanReaderCell> = {};
    for (const hole of holes) {
      const raw = (apply.strokes[hole.number] ?? "").trim();
      const value = raw === "" ? null : Number(raw);
      reader[hole.number] = {
        strokes: value !== null && Number.isInteger(value) ? value : null,
        confidence: apply.confidence[hole.number] ?? null,
      };
    }
    setScanImage(apply.image);
    setScanExtraction(apply.extraction);
    setScanCaptureKey(apply.captureKey);
    setScanReader(reader);
    setScanConfirmed(false);
    setSubmitNote("");
    setSavedNote("");
    setError(null);
  }

  function editCard(card: Scorecard) {
    setEditingCard(card);
    setCorrectionReason("");
    setEditCaptureKey(globalThis.crypto.randomUUID());
    setPendingSubmit(null);
    setPlayerId(card.playerId);
    setScorerId(card.scorerId);
    setStrokes(
      Object.fromEntries(
        card.entries.map((entry) => [
          entry.hole,
          entry.pickedUp === true ? "X" : entry.strokes === null ? "" : String(entry.strokes),
        ]),
      ),
    );
    setWrittenOnCard(card.writtenTotal === null ? "" : String(card.writtenTotal));
    setScanImage(null);
    setScanExtraction(null);
    setScanCaptureKey("");
    setScanReader({});
    setScanConfirmed(false);
    setSubmitNote("");
    setSavedNote("");
    setError(null);
    document.getElementById("score-entry-card")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function startAnother() {
    setEditingCard(null);
    setCorrectionReason("");
    setEditCaptureKey("");
    setScanImage(null);
    setScanExtraction(null);
    setScanCaptureKey("");
    setScanReader({});
    setScanConfirmed(false);
    setSubmitNote("");
    setSavedNote("");
    setPendingSubmit(null);
    setError(null);
    if (!view) return;
    setStrokes(blankStrokes(view.course.holes));
    setWrittenOnCard("");
  }

  /**
   * The player picker is the correction picker too: an existing current card opens for a new
   * revision, and a player with no card starts a fresh entry.
   */
  function changePlayer(next: string) {
    const existing = [...(view?.cards ?? [])]
      .filter(
        (card) =>
          card.playerId === next && card.status !== "revoked" && card.status !== "superseded",
      )
      .sort((a, b) => b.revision - a.revision)[0];
    if (existing) {
      editCard(existing);
      return;
    }

    startAnother();
    setPlayerId(next);
    setWrittenOnCard("");
    if (next === scorerId) {
      const rotation = reciprocalRotation(players.map((player) => player.playerId));
      setScorerId(
        rotation.find((assignment) => assignment.playerId === next)?.scorerId ??
          players.find((player) => player.playerId !== next)?.playerId ??
          "",
      );
    }
  }

  /** Enter moves to the next hole in order, so a desk can type a whole card without the mouse. */
  function focusAfter(holeNumber: number) {
    const next = holes.find((hole) => hole.number > holeNumber);
    const target = next ? document.getElementById(`hole-${next.number}`) : null;
    if (target instanceof HTMLInputElement) {
      target.focus();
      target.select();
    } else {
      document.getElementById("score-submit")?.focus();
    }
  }

  async function submitCard() {
    const gate = submitGate.current;
    // A second tap, a double click or a key repeat never reaches the repository.
    if (!gate.tryEnter()) return;
    setSubmitNote("");
    setSavedNote("");
    try {
      const targetPlayerId = editingCard?.playerId ?? playerId;
      const targetScorerId = editingCard?.scorerId ?? scorerId;
      if (targetPlayerId === targetScorerId) {
        setError("A player cannot mark their own card.");
        return;
      }
      if (editingCard && correctionReason.trim().length < 3) {
        setError("A correction needs a reason of at least 3 characters.");
        return;
      }
      if (cardValues.problems.length > 0) {
        setError(cardValues.problems[0] ?? "Every hole needs a whole-number score.");
        return;
      }
      if (scanned && scan.blankHoles.length > 0) {
        setError(
          `${scan.blankHoles.length === 1 ? "Hole" : "Holes"} ${scan.blankHoles.join(", ")} ${scan.blankHoles.length === 1 ? "is" : "are"} still empty. Type the score from the card, or clear the photo to enter the card by hand.`,
        );
        return;
      }
      if (scanned && !scanConfirmed) {
        setError("Tick the box to say you compared every flagged cell with the photo.");
        return;
      }
      const parsedWrittenOnCard = writtenOnCard.trim() === "" ? null : Number(writtenOnCard);
      if (
        parsedWrittenOnCard !== null &&
        (!Number.isInteger(parsedWrittenOnCard) || parsedWrittenOnCard < 1)
      ) {
        setError("The total written on the card must be a whole number.");
        return;
      }

      const playerName =
        players.find((player) => player.playerId === targetPlayerId)?.playerName ?? "";
      const verdict = checkCardSubmission({
        cards: view?.cards ?? [],
        playerId: targetPlayerId,
        scorerId: targetScorerId,
        entries: cardValues.entries,
        playerName,
        imageSha256: scanImage?.sha256 ?? null,
        correcting: Boolean(editingCard),
      });
      if (verdict.kind !== "new") {
        // Already in, or a correction with nothing changed: say so calmly and write nothing.
        setSubmitNote(verdict.message);
        return;
      }

      setSubmitting(true);
      const entries = cardValues.entries.map((entry) => ({
        hole: entry.hole,
        strokes: entry.strokes,
        ...(entry.pickedUp === true ? { pickedUp: true } : {}),
        confidence: scanReader[entry.hole]?.confidence ?? null,
        // A cell the person left as a weak read goes to the desk still unconfirmed.
        manuallyConfirmed: scanned ? scan.cells[entry.hole]?.state !== "check" : true,
      }));
      // A correction is a new card revision, so it gets its own capture key. Keeping that key across
      // retries makes the database treat a repeated request as the same revision, not a new one.
      const signature = cardSignature(entries);
      const retryKey =
        pendingSubmit && pendingSubmit.signature === signature ? pendingSubmit.key : "";
      const captureKey = editingCard
        ? editCaptureKey || globalThis.crypto.randomUUID()
        : scanCaptureKey || retryKey || globalThis.crypto.randomUUID();
      if (!editingCard) setPendingSubmit({ key: captureKey, signature });
      await run(async () => {
        const next = await scoring.submitCard(
          tournamentId,
          {
            playerId: targetPlayerId,
            scorerId: targetScorerId,
            source: scanImage ? "upload" : "manual",
            entries,
            writtenTotal: parsedWrittenOnCard ?? writtenTotal,
            captureKey,
            reason: editingCard ? correctionReason.trim() : undefined,
            image: scanImage
              ? {
                  path: scanImage.path,
                  sha256: scanImage.sha256,
                  mime: scanImage.mime,
                  bytes: scanImage.bytes,
                }
              : undefined,
            extraction: scanExtraction ?? undefined,
          },
          day,
        );
        setEditingCard(null);
        setCorrectionReason("");
        setEditCaptureKey("");
        setWrittenOnCard("");
        setPendingSubmit(null);
        setSavedNote(
          `Card saved for ${playerName || "this player"} and sent for approval. It does not count until it is approved.`,
        );
        return next;
      });
    } finally {
      setSubmitting(false);
      gate.leave();
    }
  }

  function resolve(playerIdToResolve: string, hole: number) {
    const key = `${playerIdToResolve}:${hole}`;
    const draft = resolutionDrafts[key];
    const pickedUp = draft?.pickedUp === true;
    const value = Number(draft?.strokes);
    if (!draft || !draft.reason.trim()) {
      setError("A resolution needs a score or a pick-up, and a reason.");
      return;
    }
    if (!pickedUp && (!Number.isInteger(value) || value < 1)) {
      setError("The resolved score must be a whole number above zero, or choose pick-up.");
      return;
    }
    void run(() =>
      scoring.resolveHole(
        tournamentId,
        {
          playerId: playerIdToResolve,
          hole,
          strokes: pickedUp ? 0 : value,
          ...(pickedUp ? { pickedUp: true } : {}),
          reason: draft.reason,
        },
        day,
      ),
    );
  }

  if (!tournament) return <NeedsTournament what="Scores" />;

  return (
    <div className="grid gap-6">
      <PageHeader
        overline="Tournament desk"
        title="Scores"
        crumbs={[
          { label: "Tournament desk", href: "/admin" },
          { label: tournament.name },
          { label: "Scores" },
        ]}
        actions={
          <>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/print">Print scorecards</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.reload()}
              disabled={busy}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Refresh
            </Button>
          </>
        }
      >
        {status === "demo"
          ? "Gross and net Stableford from approved hole scores. The sample round uses placeholder pars and stroke indexes and never writes to the live database."
          : "Gross and net Stableford from approved hole scores. Cards and desk decisions are written through the guarded database functions."}
      </PageHeader>

      <ScoresSubnav active={tab} />

      {status === "demo" ? (
        <div className="notice warn" role="note">
          <b>Sample round. </b>
          {DEMO_NOTICE}
        </div>
      ) : (
        <div className="notice info" role="note">
          <b>Connected round. </b>
          Only approved cards and desk resolutions become canonical. Publication and finalization
          stay blocked until the configured gates are met.
        </div>
      )}

      {tab === "review" && roundState && (
        <OpenRoundPanel
          key={`${day ?? "none"}:${roundState.roundStatus ?? "none"}:${roundState.draw.revision}`}
          snapshot={roundState}
          role={profileRole}
          busy={interactionBusy}
          dayNumber={day}
          onOpen={openRound}
          onReload={reloadRoundState}
        />
      )}

      {error && (
        <div className="notice bad" role="alert">
          {error}
        </div>
      )}

      {!view ? (
        loaded ? (
          <div className="card grid gap-2">
            <h2>No scoring round configured</h2>
            <p className="muted">
              This event has no daily scoring round yet, or its course, holes and event days are
              incomplete. Open the round from Review; the round is built from the published draw, so
              the pairings are never guessed.
            </p>
            <Link className="btn ghost small justify-self-start" href="/scores/review">
              Open Review
            </Link>
          </div>
        ) : (
          <div className="card" role="status">
            Loading the scoring roundGǪ
          </div>
        )
      ) : (
        <>
          {tab === "review" && (
            <section className="tiles" aria-label="Scoring at a glance">
              <div className="tile">
                <b className="mono">{view.players.length}</b>
                <span>Players in the round</span>
              </div>
              <div className="tile">
                <b className="mono">{view.cards.length}</b>
                <span>Cards submitted</span>
              </div>
              <div className="tile">
                <b className="mono">{conflicts.length}</b>
                <span>Conflicts to resolve</span>
              </div>
              <div className="tile">
                <b className="mono">
                  {view.players.reduce((sum, player) => sum + player.canonical.counts.verified, 0)}
                </b>
                <span>Verified holes</span>
              </div>
            </section>
          )}

          {tab === "review" && (
            <details className="card group" id="score-import">
              <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2">
                <FileJson className="size-4 text-fairway" aria-hidden="true" />
                <span className="font-semibold">Import cards from JSON</span>
                <span className="hint">
                  For a transcription made outside the app. Every card is checked first and still
                  needs approval.
                </span>
                <ChevronDown
                  className="ml-auto size-4 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="mt-3">
                <RoleGate
                  role={profileRole}
                  allow={["owner", "organizer", "desk"]}
                  mode="disable"
                  disabledReason="Only club staff can import cards."
                >
                  <ScorecardImportPanel
                    key={view.roundId}
                    view={view}
                    roundState={roundState}
                    busy={busy}
                    onImported={setView}
                    onImportingChange={setImportBusy}
                  />
                </RoleGate>
              </div>
            </details>
          )}

          {tab === "enter" && (
            <RoleGate
              role={profileRole}
              allow={["owner", "organizer", "desk"]}
              mode="disable"
              disabledReason="Only club staff can enter or correct cards."
            >
              <section
                id="score-entry-card"
                aria-labelledby="score-entry"
                data-help="scores-entry"
                className="grid gap-3"
              >
                <h2 id="score-entry" className="sr-only">
                  {editingCard ? "Correct a card" : "Enter a card"}
                </h2>
                <ScorecardWorkspace
                  tournamentId={tournamentId}
                  view={view}
                  players={players}
                  holes={holes}
                  playerId={playerId}
                  scorerId={scorerId}
                  selectedPlayer={selectedPlayer}
                  selectedScorer={selectedScorer}
                  context={{ className: selectedPlayer?.flightName }}
                  editingCard={editingCard}
                  editingPlayerName={editingPlayerName}
                  profileRole={profileRole}
                  canOpenProfile={canOpenProfile}
                  busy={busy}
                  submitting={submitting}
                  strokes={strokes}
                  writtenOnCard={writtenOnCard}
                  onWrittenOnCardChange={setWrittenOnCard}
                  correctionReason={correctionReason}
                  onCorrectionReasonChange={setCorrectionReason}
                  onPlayerChange={changePlayer}
                  onScorerChange={setScorerId}
                  onStrokeChange={(hole, value) =>
                    setStrokes((current) => ({ ...current, [hole]: value }))
                  }
                  onEnter={focusAfter}
                  scan={scan}
                  scanned={scanned}
                  scanImage={scanImage}
                  scanConfirmed={scanConfirmed}
                  onScanConfirmedChange={setScanConfirmed}
                  scanBlocked={scanBlocked}
                  submitNote={submitNote}
                  savedNote={savedNote}
                  onApplyScan={applyScan}
                  onSubmit={() => void submitCard()}
                  onStartAnother={startAnother}
                  onFillPar={() => setStrokes(strokesFor(holes))}
                />
              </section>
            </RoleGate>
          )}

          {tab === "review" && (
            <SectionCard
              id="score-cards"
              icon={<Flag />}
              title="Cards"
              subtitle="Approve only after the card is checked. Low-confidence values need a person to confirm them."
              dataHelp="scores-cards"
            >
              {view.cards.length === 0 ? (
                <p className="muted">No cards yet. Enter one above.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Marked by</th>
                        <th>Status</th>
                        <th>Check</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {[...view.cards].reverse().map((card) => (
                        <CardRow
                          key={card.id}
                          card={card}
                          view={view}
                          busy={busy}
                          role={profileRole}
                          rejectReason={rejectReasons[card.id] ?? ""}
                          onRejectReason={(value) =>
                            setRejectReasons((current) => ({ ...current, [card.id]: value }))
                          }
                          onApprove={() =>
                            void run(() =>
                              scoring.approveCard(tournamentId, card.id, "Desk approval", day),
                            )
                          }
                          onReject={() => {
                            const reason = (rejectReasons[card.id] ?? "").trim();
                            if (!reason) {
                              setError("A rejection needs a reason.");
                              return;
                            }
                            void run(() => scoring.rejectCard(tournamentId, card.id, reason, day));
                          }}
                          canEdit={canEdit}
                          onEdit={() => router.push(`/scores?card=${encodeURIComponent(card.id)}`)}
                          roundLocked={view.roundStatus === "final"}
                          onRevoke={() => {
                            const reason = (rejectReasons[card.id] ?? "").trim();
                            if (reason.length < 3) {
                              setError("A revocation needs a reason of at least 3 characters.");
                              return;
                            }
                            void run(async () => {
                              const next = await scoring.revokeCard(
                                tournamentId,
                                card.id,
                                reason,
                                day,
                              );
                              setRejectReasons((current) => ({ ...current, [card.id]: "" }));
                              return next;
                            });
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}
          {tab === "review" && (
            <SectionCard
              id="score-conflicts"
              icon={<AlertTriangle />}
              title="Conflicts"
              subtitle="Cards that disagree are never overwritten by a majority. The desk records the value and the reason."
              dataHelp="scores-conflicts"
            >
              {conflicts.length === 0 ? (
                <p className="muted">No unresolved card conflicts.</p>
              ) : (
                <div className="grid gap-3">
                  {conflicts.map(({ playerId: conflictPlayerId, playerName, hole }) => {
                    const key = `${conflictPlayerId}:${hole.hole}`;
                    const draft = resolutionDrafts[key] ?? { strokes: "", reason: "" };
                    return (
                      <div key={key} className="card grid gap-3 !p-3">
                        <div>
                          <p className="m-0">
                            <PlayerLink
                              playerId={conflictPlayerId}
                              name={playerName}
                              role={profileRole}
                            />{" "}
                            <span className="font-semibold">-+ hole {hole.hole}</span>
                          </p>
                          <p className="hint mt-0.5">{hole.note ?? "The cards disagree."}</p>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="field w-24">
                            <span>Strokes</span>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={draft.strokes}
                              onChange={(event) => {
                                const value = event.target.value;
                                setResolutionDrafts((current) => {
                                  const existing = current[key] ?? { strokes: "", reason: "" };
                                  return {
                                    ...current,
                                    [key]: { ...existing, strokes: value },
                                  };
                                });
                              }}
                              disabled={busy || draft.pickedUp === true}
                            />
                          </label>
                          <label className="flex min-h-11 items-center gap-2 text-[12px] lg:min-h-9">
                            <input
                              type="checkbox"
                              checked={draft.pickedUp === true}
                              onChange={(event) => {
                                const pickedUp = event.target.checked;
                                setResolutionDrafts((current) => {
                                  const existing = current[key] ?? { strokes: "", reason: "" };
                                  return {
                                    ...current,
                                    [key]: { ...existing, pickedUp },
                                  };
                                });
                              }}
                              disabled={busy}
                            />
                            <span>Pick-up (X), 0 points</span>
                          </label>
                          <label className="field min-w-[16rem] flex-1">
                            <span>Reason</span>
                            <input
                              value={draft.reason}
                              onChange={(event) => {
                                const value = event.target.value;
                                setResolutionDrafts((current) => {
                                  const existing = current[key] ?? { strokes: "", reason: "" };
                                  return {
                                    ...current,
                                    [key]: { ...existing, reason: value },
                                  };
                                });
                              }}
                              placeholder="What did the desk check?"
                              disabled={busy}
                            />
                          </label>
                          <Button
                            variant="gold"
                            size="sm"
                            onClick={() => resolve(conflictPlayerId, hole.hole)}
                            disabled={busy}
                          >
                            Resolve
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          )}

          {tab === "results" && (
            <div className="grid items-start gap-6 xl:grid-cols-2">
              <SectionCard
                id="score-gross"
                icon={<Trophy />}
                title="Gross Stableford"
                subtitle="Highest points first. Holes counted are shown because the round may still be incomplete."
                dataHelp="scores-gross"
              >
                <StandingsTable
                  board={view.standings.gross}
                  players={view.players}
                  role={profileRole}
                />
              </SectionCard>
              <SectionCard
                id="score-net"
                icon={<Trophy />}
                title="Net Stableford"
                subtitle="Uses each player's Playing Handicap snapshot. The PH column is that snapshot; a player without one is left out, not estimated."
                dataHelp="scores-net"
              >
                <StandingsTable
                  board={view.standings.net}
                  players={view.players}
                  role={profileRole}
                />
              </SectionCard>
            </div>
          )}

          {tab === "results" && (
            <SectionCard
              id="score-final"
              icon={<CheckCircle2 />}
              title="Publication and finalization"
              subtitle="Provisional publication is explicit. Final standings stay blocked until every gate is satisfied."
              dataHelp="scores-final"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill warn">Provisional only</span>
                <span className="pill info">
                  {view.publications.length === 0
                    ? "Not published yet"
                    : `Published v${view.publications.at(-1)?.version} (${view.publications.at(-1)?.state})`}
                </span>
                <span className="pill">
                  {view.roundStatus === "final"
                    ? "Final"
                    : view.roundStatus === "provisional"
                      ? "Provisional published"
                      : "Scoring open"}
                </span>
                <span className="pill">Authority: {view.finalizationAuthority ?? "not set"}</span>
              </div>

              {view.finalization.blockers.length > 0 || !view.finalizationAuthority ? (
                <div className="notice warn" role="status">
                  <b>Finalization is blocked:</b>
                  <ul>
                    {!view.finalizationAuthority && (
                      <li>The final approval authority has not been confirmed.</li>
                    )}
                    {view.finalization.blockers.map((blocker) => (
                      <li
                        key={`${blocker.code}-${blocker.playerId ?? "round"}-${blocker.hole ?? ""}`}
                      >
                        {blocker.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="notice ok" role="status">
                  Every finalization gate is satisfied. An authorized organizer can finalize.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <RoleGate
                  role={profileRole}
                  allow={["owner", "organizer", "desk"]}
                  mode="disable"
                  disabledReason="Only club staff can publish provisional results."
                >
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy || view.roundStatus === "final" || !view.provisionalPublication}
                    onClick={() =>
                      void run(() =>
                        scoring.publishRound(tournamentId, "Provisional publication", day),
                      )
                    }
                  >
                    Publish provisional
                  </Button>
                </RoleGate>
                <RoleGate
                  role={profileRole}
                  allow={["owner", "organizer"]}
                  mode="disable"
                  disabledReason="Only an owner or organizer can finalize."
                >
                  <Button
                    variant="gold"
                    size="sm"
                    disabled={
                      busy ||
                      !view.finalization.ready ||
                      !view.finalizationAuthority ||
                      view.roundStatus === "final"
                    }
                    onClick={() =>
                      void run(() => scoring.finalizeRound(tournamentId, "Final publication", day))
                    }
                  >
                    Finalize results
                  </Button>
                </RoleGate>
              </div>
              <p className="hint">
                {status === "demo"
                  ? "The sample uses a proposed tie-break that is deliberately unconfirmed, so finalization stays blocked. The organizer's written rule is still required."
                  : "Finalization stays blocked until the organizer's card count, net results, tie-break rule and final approval authority are all recorded."}
              </p>
              <p className="hint">
                A correction or a revocation after publication changes the standings, but the live
                board keeps the last published version until you publish again.
              </p>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}

function CardRow({
  card,
  view,
  busy,
  role,
  rejectReason,
  onRejectReason,
  onApprove,
  onReject,
  canEdit,
  onEdit,
  roundLocked,
  onRevoke,
}: {
  card: Scorecard;
  view: ScoringRoundView;
  busy: boolean;
  role?: ClubRole | null;
  rejectReason: string;
  onRejectReason: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  canEdit: boolean;
  onEdit: () => void;
  roundLocked: boolean;
  onRevoke: () => void;
}) {
  const player = view.players.find((candidate) => candidate.playerId === card.playerId) ?? null;
  const playerName = player?.playerName ?? card.playerId;
  const scorerName =
    view.players.find((player) => player.playerId === card.scorerId)?.playerName ?? card.scorerId;
  const handicapCheck = checkHandicapSnapshot({
    handicap: player?.handicap ?? null,
    frozenIndex: player?.frozenIndex,
    roundTeeId: view.course.tee.id,
  });
  const validation = validateScorecard(card, {
    course: view.course,
    minOcrConfidence: view.policy.minOcrConfidence,
  });
  const decided =
    card.status === "approved" || card.status === "rejected" || card.status === "revoked";
  // Only the newest revision is the card the desk is working on. Editing an older one after a
  // correction would create a third revision out of order.
  const latestRevision = Math.max(
    ...view.cards
      .filter(
        (candidate) => candidate.playerId === card.playerId && candidate.scorerId === card.scorerId,
      )
      .map((candidate) => candidate.revision),
  );
  const cardEditable =
    canEdit &&
    card.revision === latestRevision &&
    (card.status === "submitted" || card.status === "in_review" || card.status === "approved");

  return (
    <tr>
      <td>
        <PlayerLink playerId={card.playerId} name={playerName} role={role} />
        <span className="hint block">Revision {card.revision}</span>
        {player?.handicap ? (
          <span className="hint block">
            Index {fmtIndex(player.handicap.index)} -+ PH {fmtHcp(player.handicap.playingHandicap)}
          </span>
        ) : (
          <span className="hint block">No handicap snapshot</span>
        )}
        {(handicapCheck.indexDiffers || handicapCheck.teeDiffers) && (
          <span className="mt-1 flex flex-wrap gap-1">
            {handicapCheck.indexDiffers && (
              <span
                className="pill warn"
                title="The round snapshot and the registration freeze disagree"
              >
                Frozen {fmtIndex(handicapCheck.frozenIndex)}
              </span>
            )}
            {handicapCheck.teeDiffers && (
              <span className="pill warn" title="This snapshot uses a different tee from the round">
                Different tee
              </span>
            )}
          </span>
        )}
      </td>
      <td>
        <PlayerLink playerId={card.scorerId} name={scorerName} role={role} />
      </td>
      <td>
        <span
          className={`pill ${
            card.status === "approved"
              ? "ok"
              : card.status === "rejected" || card.status === "revoked"
                ? "bad"
                : "warn"
          }`}
        >
          {card.status}
        </span>
      </td>
      <td className="max-w-[18rem] text-[13px]">
        {card.status === "approved" ? (
          <span className="muted">Approved.</span>
        ) : card.status === "rejected" ? (
          <span className="muted">Rejected.</span>
        ) : card.status === "revoked" ? (
          <span className="muted">Revoked. It no longer counts.</span>
        ) : validation.approvable ? (
          <span className="muted">Ready for approval.</span>
        ) : (
          <span>{issueLabel(validation.issues)}</span>
        )}
      </td>
      <td>
        <div className="flex flex-wrap items-center gap-1.5">
          {!decided && (
            <>
              <Button variant="primary" size="sm" onClick={onApprove} disabled={busy}>
                Approve
              </Button>
              <input
                value={rejectReason}
                onChange={(event) => onRejectReason(event.target.value)}
                placeholder="Reason"
                aria-label={`Rejection reason for ${playerName}'s card`}
                className="h-8 w-28"
                disabled={busy}
              />
              <Button variant="danger" size="sm" onClick={onReject} disabled={busy}>
                Reject
              </Button>
            </>
          )}
          {card.status === "approved" && (
            <>
              <input
                value={rejectReason}
                onChange={(event) => onRejectReason(event.target.value)}
                placeholder="Revoke reason"
                aria-label={`Revocation reason for ${playerName}'s card`}
                className="h-8 w-28"
                disabled={busy || roundLocked}
              />
              <Button
                variant="danger"
                size="sm"
                onClick={onRevoke}
                disabled={busy || roundLocked}
                title={
                  roundLocked
                    ? "A finalized round is locked; this score cannot change."
                    : "Withdraw this card from the scores. The card and its audit row are kept."
                }
              >
                Revoke
              </Button>
            </>
          )}
          {cardEditable && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onEdit}
              disabled={busy}
              aria-label={`Edit ${playerName}'s card`}
            >
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function StandingsTable({
  board,
  players = [],
  role,
}: {
  board: StandingsBoard;
  players?: ScoringRoundView["players"];
  role?: ClubRole | null;
}) {
  if (board.rows.length === 0) {
    return <p className="muted">No player has a verified or provisional hole yet.</p>;
  }
  const showHandicap = board.kind === "net";
  const handicapByPlayer = new Map(
    players.map((player) => [player.playerId, player.handicap?.playingHandicap ?? null]),
  );
  const classNameByPlayer = new Map(
    players.map((player) => [player.playerId, player.flightName ?? null]),
  );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pos</th>
            <th>Player</th>
            {showHandicap && (
              <th className="num" title="Playing handicap snapshot used for net scoring">
                PH
              </th>
            )}
            <th className="num">Pts</th>
            <th className="num">Strokes</th>
            <th className="num">Holes</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row: StandingsRow) => (
            <tr key={row.playerId}>
              <td className="num mono">
                {row.position}
                {row.tied ? "T" : ""}
              </td>
              <td>
                <PlayerLink playerId={row.playerId} name={row.playerName} role={role} />
                <span className="hint block">
                  {classLabel(classNameByPlayer.get(row.playerId))}
                </span>
              </td>
              {showHandicap && (
                <td className="num mono">{fmtHcp(handicapByPlayer.get(row.playerId) ?? null)}</td>
              )}
              <td className="num mono">
                {row[board.kind === "gross" ? "grossPoints" : "netPoints"]}
              </td>
              <td className="num mono">
                {row[board.kind === "gross" ? "grossStrokes" : "netStrokes"] ?? "G��"}
              </td>
              <td className="num mono">
                {row.holesCounted}/{row.totalHoles}
              </td>
              <td>
                <span className={`pill ${row.complete ? "ok" : "warn"}`}>
                  {row.complete ? "Complete" : "Provisional"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
