"use client";

import { AlertTriangle, CheckCircle2, ClipboardList, Flag, RotateCcw, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RoleGate } from "@/components/desk/RoleGate";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { createDemoScoringRepository, type ScoringRoundView } from "@/lib/data/scoring";
import { buildDemoScoringSeed } from "@/lib/demo/scoring";
import {
  type CardIssue,
  type Scorecard,
  type StandingsBoard,
  type StandingsRow,
  validateScorecard,
} from "@/lib/scoring";
import { useDesk } from "@/lib/store/desk-store";

const SEED = buildDemoScoringSeed();
const PLAYERS = SEED.players;
const HOLES = SEED.course.holes;
const TOTAL_PAR = HOLES.reduce((sum, hole) => sum + hole.par, 0);

const DEMO_NOTICE =
  "Sample scoring preview. Cards, approvals, resolutions and standings live in this browser only and are not written to the database. The scoring schema and RPCs are applied; this screen is not wired to them yet.";

function emptyStrokes(): Record<number, string> {
  return Object.fromEntries(HOLES.map((hole) => [hole.number, String(hole.par)]));
}

function issueLabel(issues: CardIssue[]): string {
  const first = issues.find((issue) => issue.severity === "blocking") ?? issues[0];
  if (!first) return "Ready";
  return first.message;
}

export default function ScoresPage() {
  const { member, tournament } = useDesk();
  const [repository] = useState(() => createDemoScoringRepository(SEED, { actor: "desk-demo" }));
  const [view, setView] = useState<ScoringRoundView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playerId, setPlayerId] = useState(PLAYERS[0]?.playerId ?? "");
  const [scorerId, setScorerId] = useState(PLAYERS[1]?.playerId ?? "");
  const [strokes, setStrokes] = useState<Record<number, string>>(emptyStrokes);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [resolutionDrafts, setResolutionDrafts] = useState<
    Record<string, { strokes: string; reason: string }>
  >({});

  useEffect(() => {
    let cancelled = false;
    repository
      .loadRound(SEED.tournamentId)
      .then((next) => {
        if (!cancelled) setView(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const conflicts = useMemo(() => {
    if (!view) return [];
    return view.players.flatMap((player) =>
      player.canonical.holes
        .filter((hole) => hole.status === "conflict")
        .map((hole) => ({ playerId: player.playerId, playerName: player.playerName, hole })),
    );
  }, [view]);

  const writtenTotal = HOLES.reduce((sum, hole) => {
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

  function submitCard() {
    if (playerId === scorerId) {
      setError("A player cannot mark their own card.");
      return;
    }
    const entries = HOLES.map((hole) => ({
      hole: hole.number,
      strokes: Number(strokes[hole.number]),
      confidence: null,
      manuallyConfirmed: true,
    }));
    if (entries.some((entry) => !Number.isInteger(entry.strokes))) {
      setError("Every hole needs a whole-number score.");
      return;
    }
    void run(() =>
      repository.submitCard(SEED.tournamentId, {
        playerId,
        scorerId,
        source: "manual",
        entries,
        writtenTotal,
        captureKey: globalThis.crypto.randomUUID(),
      }),
    );
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
      repository.resolveHole(SEED.tournamentId, {
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
              Reset preview
            </Button>
          </>
        }
      >
        Gross and net Stableford from approved hole scores. The sample round uses placeholder pars
        and stroke indexes and never writes to the live database.
      </PageHeader>

      <div className="notice warn" role="note">
        <b>Sample round. </b>
        {DEMO_NOTICE}
      </div>

      {error && (
        <div className="notice bad" role="alert">
          {error}
        </div>
      )}

      {!view ? (
        <div className="card" role="status">
          Loading the sample scoring round…
        </div>
      ) : (
        <>
          <section className="tiles" aria-label="Scoring at a glance">
            <div className="tile">
              <b className="mono">{view.players.length}</b>
              <span>Players in the sample round</span>
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
                title="Enter a card"
                subtitle="Manual entry first. The same validation will run behind webcam and upload later."
                dataHelp="scores-entry"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="field">
                    <span>Player</span>
                    <select
                      value={playerId}
                      onChange={(event) => setPlayerId(event.target.value)}
                      disabled={busy}
                    >
                      {PLAYERS.map((player) => (
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
                      disabled={busy}
                    >
                      {PLAYERS.filter((player) => player.playerId !== playerId).map((player) => (
                        <option key={player.playerId} value={player.playerId}>
                          {player.playerName}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {HOLES.map((hole) => (
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
                    <b className="mono">{TOTAL_PAR}</b>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStrokes(emptyStrokes())}
                      disabled={busy}
                    >
                      Reset to par
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={submitCard}
                      disabled={busy}
                      data-help="scores-submit"
                    >
                      Submit card
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
                              repository.approveCard(SEED.tournamentId, card.id, "Desk approval"),
                            )
                          }
                          onReject={() => {
                            const reason = (rejectReasons[card.id] ?? "").trim();
                            if (!reason) {
                              setError("A rejection needs a reason.");
                              return;
                            }
                            void run(() =>
                              repository.rejectCard(SEED.tournamentId, card.id, reason),
                            );
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
              subtitle="Uses each player's Playing Handicap snapshot. A player without a snapshot is left out, not estimated."
              dataHelp="scores-net"
            >
              <StandingsTable board={view.standings.net} />
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
            </div>

            {view.finalization.blockers.length > 0 ? (
              <div className="notice warn" role="status">
                <b>Finalization is blocked:</b>
                <ul>
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
                    void run(() =>
                      repository.publishRound(SEED.tournamentId, "Sample provisional publication"),
                    )
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
                  disabled={busy || !view.finalization.ready || view.roundStatus === "final"}
                  onClick={() =>
                    void run(() =>
                      repository.finalizeRound(SEED.tournamentId, "Sample final publication"),
                    )
                  }
                >
                  Finalize results
                </Button>
              </RoleGate>
            </div>
            <p className="hint">
              The sample round has no organizer tie-break rule, so finalization stays blocked on
              purpose. The engine and the database gate the same requirement.
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
}: {
  card: Scorecard;
  view: ScoringRoundView;
  busy: boolean;
  rejectReason: string;
  onRejectReason: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const playerName =
    PLAYERS.find((player) => player.playerId === card.playerId)?.playerName ?? card.playerId;
  const scorerName =
    PLAYERS.find((player) => player.playerId === card.scorerId)?.playerName ?? card.scorerId;
  const validation = validateScorecard(card, {
    course: view.course,
    minOcrConfidence: view.policy.minOcrConfidence,
  });
  const decided = card.status === "approved" || card.status === "rejected";

  return (
    <tr>
      <td>
        <b>{playerName}</b>
        <span className="hint block">Revision {card.revision}</span>
      </td>
      <td>{scorerName}</td>
      <td>
        <span
          className={`pill ${
            card.status === "approved" ? "ok" : card.status === "rejected" ? "bad" : "warn"
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
        ) : validation.approvable ? (
          <span className="muted">Ready for approval.</span>
        ) : (
          <span>{issueLabel(validation.issues)}</span>
        )}
      </td>
      <td>
        {!decided && (
          <div className="flex flex-wrap items-center gap-1.5">
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
          </div>
        )}
      </td>
    </tr>
  );
}

function StandingsTable({ board }: { board: StandingsBoard }) {
  if (board.rows.length === 0) {
    return <p className="muted">No player has a verified or provisional hole yet.</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pos</th>
            <th>Player</th>
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
