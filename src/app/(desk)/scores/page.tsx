"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Flag,
  Pencil,
  RotateCcw,
  ScanLine,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RoleGate } from "@/components/desk/RoleGate";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { HandicapSummary } from "@/components/scoring/HandicapSummary";
import { ScorecardScan } from "@/components/scoring/ScorecardScan";
import { Button } from "@/components/ui/button";
import type { ScoringRoundView } from "@/lib/data/scoring";
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
import type { ScorecardScanApply, ScorecardScanImage } from "@/lib/scoring/scan/types";
import { useDesk } from "@/lib/store/desk-store";

const DEMO_NOTICE =
  "Sample scoring preview. Cards, approvals, resolutions and standings live in this browser only and are not written to the database. The scoring schema and RPCs are applied; this screen is not wired to them yet.";

function strokesFor(holes: readonly HoleDefinition[]): Record<number, string> {
  return Object.fromEntries(holes.map((hole) => [hole.number, String(hole.par)]));
}

function issueLabel(issues: CardIssue[]): string {
  const first = issues.find((issue) => issue.severity === "blocking") ?? issues[0];
  if (!first) return "Ready";
  return first.message;
}

export default function ScoresPage() {
  const { member, tournament, scoring, status } = useDesk();
  const tournamentId = tournament?.id ?? "";
  const [view, setView] = useState<ScoringRoundView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playerId, setPlayerId] = useState("");
  const [scorerId, setScorerId] = useState("");
  const [strokes, setStrokes] = useState<Record<number, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [resolutionDrafts, setResolutionDrafts] = useState<
    Record<string, { strokes: string; reason: string }>
  >({});
  const [scanImage, setScanImage] = useState<ScorecardScanImage | null>(null);
  const [scanExtraction, setScanExtraction] = useState<ScorecardScanApply["extraction"]>(null);
  const [scanCaptureKey, setScanCaptureKey] = useState("");
  /** The card being corrected. A correction is a new revision, never an edit of the old row. */
  const [editingCard, setEditingCard] = useState<Scorecard | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  /** Reused across retries, so a failed reason write cannot create a second revision. */
  const [editCaptureKey, setEditCaptureKey] = useState("");

  const players = view?.players ?? [];
  const holes = view?.course.holes ?? [];
  const canEdit = status === "demo" || member?.role === "owner" || member?.role === "organizer";
  const totalPar = holes.reduce((sum, hole) => sum + hole.par, 0);
  const selectedPlayer = players.find((player) => player.playerId === playerId) ?? null;
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
    scoring
      .loadRound(tournamentId)
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
  }, [scoring, tournamentId]);

  useEffect(() => {
    if (!view) return;
    setStrokes(strokesFor(view.course.holes));
    setEditingCard(null);
    setCorrectionReason("");
    setEditCaptureKey("");
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
    return sum + (Number.isInteger(value) ? value : 0);
  }, 0);

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

  function applyScan(apply: ScorecardScanApply) {
    const nextPlayer = apply.playerId;
    setPlayerId(nextPlayer);
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
    setScanImage(apply.image);
    setScanExtraction(apply.extraction);
    setScanCaptureKey(apply.captureKey);
    setError(null);
  }

  function editCard(card: Scorecard) {
    setEditingCard(card);
    setCorrectionReason("");
    setEditCaptureKey(globalThis.crypto.randomUUID());
    setPlayerId(card.playerId);
    setScorerId(card.scorerId);
    setStrokes(
      Object.fromEntries(card.entries.map((entry) => [entry.hole, String(entry.strokes)])),
    );
    setScanImage(null);
    setScanExtraction(null);
    setScanCaptureKey("");
    setError(null);
    document.getElementById("score-entry")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    setEditingCard(null);
    setCorrectionReason("");
    setEditCaptureKey("");
    setScanImage(null);
    setScanExtraction(null);
    setScanCaptureKey("");
    setError(null);
    if (!view) return;
    setStrokes(strokesFor(view.course.holes));
    const first = view.players[0]?.playerId ?? "";
    const rotation = reciprocalRotation(view.players.map((player) => player.playerId));
    setPlayerId(first);
    setScorerId(
      rotation.find((assignment) => assignment.playerId === first)?.scorerId ??
        view.players[1]?.playerId ??
        "",
    );
  }

  function submitCard() {
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
    const entries = holes.map((hole) => ({
      hole: hole.number,
      strokes: Number(strokes[hole.number]),
      confidence: null,
      manuallyConfirmed: true,
    }));
    if (entries.some((entry) => !Number.isInteger(entry.strokes))) {
      setError("Every hole needs a whole-number score.");
      return;
    }
    // A correction is a new card revision, so it gets its own capture key. Keeping that key across
    // retries makes the database treat a repeated request as the same revision, not a new one.
    const captureKey = editingCard
      ? editCaptureKey || globalThis.crypto.randomUUID()
      : scanCaptureKey || globalThis.crypto.randomUUID();
    void run(async () => {
      const next = await scoring.submitCard(tournamentId, {
        playerId: targetPlayerId,
        scorerId: targetScorerId,
        source: scanImage ? "upload" : "manual",
        entries,
        writtenTotal,
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
      });
      setEditingCard(null);
      setCorrectionReason("");
      setEditCaptureKey("");
      setScanImage(null);
      setScanExtraction(null);
      setScanCaptureKey("");
      return next;
    });
  }

  function resolve(playerIdToResolve: string, hole: number) {
    const key = `${playerIdToResolve}:${hole}`;
    const draft = resolutionDrafts[key];
    const value = Number(draft?.strokes);
    if (!draft || !draft.reason.trim()) {
      setError("A resolution needs a score and a reason.");
      return;
    }
    if (!Number.isInteger(value) || value < 1) {
      setError("The resolved score must be a whole number above zero.");
      return;
    }
    void run(() =>
      scoring.resolveHole(tournamentId, {
        playerId: playerIdToResolve,
        hole,
        strokes: value,
        reason: draft.reason,
      }),
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
              This event has no daily scoring round yet, or its course and tee data are incomplete.
              Set up the course, holes and round first; then this screen can load the field.
            </p>
          </div>
        ) : (
          <div className="card" role="status">
            Loading the scoring round…
          </div>
        )
      ) : (
        <>
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

          <SectionCard
            id="score-scan"
            icon={<ScanLine />}
            title="Scan a card"
            subtitle="Take a photo of the paper card. The reader can draft the scores; the desk still checks every value before submitting."
            dataHelp="scores-scan"
          >
            <RoleGate
              role={member?.role}
              allow={["owner", "organizer", "desk"]}
              mode="disable"
              disabledReason="Only club staff can scan a card."
            >
              <ScorecardScan
                tournamentId={tournamentId}
                players={players.map((player) => ({
                  playerId: player.playerId,
                  playerName: player.playerName,
                }))}
                holes={holes}
                disabled={busy || Boolean(editingCard)}
                onApply={applyScan}
              />
            </RoleGate>
          </SectionCard>

          <div className="grid items-start gap-6 xl:grid-cols-2">
            <RoleGate
              role={member?.role}
              allow={["owner", "organizer", "desk"]}
              mode="disable"
              disabledReason="Only club staff can enter or approve cards."
            >
              <SectionCard
                id="score-entry"
                icon={<ClipboardList />}
                title={editingCard ? "Correct a card" : "Enter a card"}
                subtitle={
                  editingCard
                    ? "Saving adds a new revision. The old revision stays in the record and the new one needs approval."
                    : "Manual entry first. The same validation will run behind webcam and upload later."
                }
                dataHelp="scores-entry"
              >
                {editingCard && (
                  <div className="notice info grid gap-2" role="note">
                    <p className="m-0 text-[13px]">
                      <b>
                        Correcting revision {editingCard.revision} for {editingPlayerName}.
                      </b>{" "}
                      The new revision needs approval before it counts, and the old revision stays
                      in the audit.
                    </p>
                    <label className="field">
                      <span>Correction reason (required)</span>
                      <input
                        type="text"
                        value={correctionReason}
                        onChange={(event) => setCorrectionReason(event.target.value)}
                        placeholder="What is being corrected?"
                        aria-label="Correction reason"
                        disabled={busy}
                      />
                    </label>
                  </div>
                )}
                {scanImage && (
                  <div className="notice info" role="status">
                    <b>Photo attached. </b>This card will be saved with the upload. Submit only
                    after every hole is checked.
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="field">
                    <span>Player</span>
                    <select
                      value={playerId}
                      onChange={(event) => {
                        const next = event.target.value;
                        setPlayerId(next);
                        if (next === scorerId) {
                          const rotation = reciprocalRotation(
                            players.map((player) => player.playerId),
                          );
                          const mapped = rotation.find(
                            (assignment) => assignment.playerId === next,
                          )?.scorerId;
                          setScorerId(
                            mapped ??
                              players.find((player) => player.playerId !== next)?.playerId ??
                              "",
                          );
                        }
                      }}
                      disabled={busy || players.length < 2 || Boolean(editingCard)}
                    >
                      {players.map((player) => (
                        <option key={player.playerId} value={player.playerId}>
                          {player.playerName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Marked by</span>
                    <select
                      value={scorerId}
                      onChange={(event) => setScorerId(event.target.value)}
                      disabled={busy || players.length < 2 || Boolean(editingCard)}
                    >
                      {players
                        .filter((player) => player.playerId !== playerId)
                        .map((player) => (
                          <option key={player.playerId} value={player.playerId}>
                            {player.playerName}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                {!editingCard && (
                  <p className="hint">
                    Proposed rotation: each player marks the next, and the last marks the first.
                    Change the marker if the desk assigned a different one.
                  </p>
                )}

                {players.length < 2 && (
                  <p className="notice warn" role="status">
                    At least two active players are needed before a card can be entered: one player
                    and one marker.
                  </p>
                )}

                {selectedPlayer && (
                  <HandicapSummary
                    playerId={selectedPlayer.playerId}
                    playerName={selectedPlayer.playerName}
                    handicap={selectedPlayer.handicap}
                    frozenIndex={selectedPlayer.frozenIndex}
                    course={view.course}
                  />
                )}

                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {holes.map((hole) => (
                    <label key={hole.number} className="field">
                      <span className="text-[11px]">
                        H{hole.number} · par {hole.par} · SI {hole.strokeIndex}
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={20}
                        value={strokes[hole.number] ?? ""}
                        onChange={(event) =>
                          setStrokes((current) => ({
                            ...current,
                            [hole.number]: event.target.value,
                          }))
                        }
                        disabled={busy}
                      />
                    </label>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="hint">
                    Written total <b className="mono">{writtenTotal}</b> · par{" "}
                    <b className="mono">{totalPar}</b>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {editingCard && (
                      <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={busy}>
                        Cancel correction
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStrokes(strokesFor(holes))}
                      disabled={busy}
                    >
                      Reset to par
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={submitCard}
                      disabled={busy || players.length < 2}
                      data-help="scores-submit"
                    >
                      {editingCard ? "Submit correction" : "Submit card"}
                    </Button>
                  </div>
                </div>
              </SectionCard>
            </RoleGate>

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
                          rejectReason={rejectReasons[card.id] ?? ""}
                          onRejectReason={(value) =>
                            setRejectReasons((current) => ({ ...current, [card.id]: value }))
                          }
                          onApprove={() =>
                            void run(() =>
                              scoring.approveCard(tournamentId, card.id, "Desk approval"),
                            )
                          }
                          onReject={() => {
                            const reason = (rejectReasons[card.id] ?? "").trim();
                            if (!reason) {
                              setError("A rejection needs a reason.");
                              return;
                            }
                            void run(() => scoring.rejectCard(tournamentId, card.id, reason));
                          }}
                          canEdit={canEdit}
                          onEdit={() => editCard(card)}
                          roundLocked={view.roundStatus === "final"}
                          onRevoke={() => {
                            const reason = (rejectReasons[card.id] ?? "").trim();
                            if (reason.length < 3) {
                              setError("A revocation needs a reason of at least 3 characters.");
                              return;
                            }
                            void run(async () => {
                              const next = await scoring.revokeCard(tournamentId, card.id, reason);
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
          </div>

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
                        <b>
                          {playerName} · hole {hole.hole}
                        </b>
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
                            disabled={busy}
                          />
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

          <div className="grid items-start gap-6 xl:grid-cols-2">
            <SectionCard
              id="score-gross"
              icon={<Trophy />}
              title="Gross Stableford"
              subtitle="Highest points first. Holes counted are shown because the round may still be incomplete."
              dataHelp="scores-gross"
            >
              <StandingsTable board={view.standings.gross} />
            </SectionCard>
            <SectionCard
              id="score-net"
              icon={<Trophy />}
              title="Net Stableford"
              subtitle="Uses each player's Playing Handicap snapshot. The PH column is that snapshot; a player without one is left out, not estimated."
              dataHelp="scores-net"
            >
              <StandingsTable board={view.standings.net} players={view.players} />
            </SectionCard>
          </div>

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
                role={member?.role}
                allow={["owner", "organizer", "desk"]}
                mode="disable"
                disabledReason="Only club staff can publish provisional results."
              >
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || view.roundStatus === "final" || !view.provisionalPublication}
                  onClick={() =>
                    void run(() => scoring.publishRound(tournamentId, "Provisional publication"))
                  }
                >
                  Publish provisional
                </Button>
              </RoleGate>
              <RoleGate
                role={member?.role}
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
                    void run(() => scoring.finalizeRound(tournamentId, "Final publication"))
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
        </>
      )}
    </div>
  );
}

function CardRow({
  card,
  view,
  busy,
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
        <b>{playerName}</b>
        <span className="hint block">Revision {card.revision}</span>
        {player?.handicap ? (
          <span className="hint block">
            Index {fmtIndex(player.handicap.index)} · PH {fmtHcp(player.handicap.playingHandicap)}
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
      <td>{scorerName}</td>
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
}: {
  board: StandingsBoard;
  players?: ScoringRoundView["players"];
}) {
  if (board.rows.length === 0) {
    return <p className="muted">No player has a verified or provisional hole yet.</p>;
  }
  const showHandicap = board.kind === "net";
  const handicapByPlayer = new Map(
    players.map((player) => [player.playerId, player.handicap?.playingHandicap ?? null]),
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
                <b>{row.playerName}</b>
                <span className="hint block">{row.flightId ?? "No flight"}</span>
              </td>
              {showHandicap && (
                <td className="num mono">{fmtHcp(handicapByPlayer.get(row.playerId) ?? null)}</td>
              )}
              <td className="num mono">
                {row[board.kind === "gross" ? "grossPoints" : "netPoints"]}
              </td>
              <td className="num mono">
                {row[board.kind === "gross" ? "grossStrokes" : "netStrokes"] ?? "—"}
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
