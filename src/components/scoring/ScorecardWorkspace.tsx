"use client";

import { CheckCircle2, Loader2, Printer, ScanLine } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CardContextLine } from "@/components/scoring/CardContextLine";
import { HandicapSummary } from "@/components/scoring/HandicapSummary";
import { PlayerLink } from "@/components/scoring/PlayerLink";
import { ScorecardHoleGrid } from "@/components/scoring/ScorecardHoleGrid";
import { ScorecardScan } from "@/components/scoring/ScorecardScan";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import type { ClubRole } from "@/lib/auth/member";
import { playerProfileHref } from "@/lib/data/player-profile";
import type { ScoringPlayer, ScoringRoundView } from "@/lib/data/scoring";
import type { HoleDefinition, Scorecard } from "@/lib/scoring";
import { buildCardContext } from "@/lib/scoring/card-context";
import {
  cardBoxNote,
  type EventScoringRules,
  eventHandicapSnapshot,
  eventPlayingHandicap,
  readCardBox,
} from "@/lib/scoring/event-rules";
import type { ScanCardReview } from "@/lib/scoring/scan/review";
import type { ScorecardScanApply, ScorecardScanImage } from "@/lib/scoring/scan/types";
import {
  type ScorecardReviewState,
  scorecardReadiness,
  summariseScorecard,
} from "@/lib/scoring/workspace";

export interface ScorecardContext {
  className?: string | null;
  partnerName?: string | null;
  teamHandicap?: number | null;
  teeName?: string | null;
  groupLabel?: string | null;
  cardHandicap?: number | null;
}

export interface ScorecardWorkspaceProps {
  tournamentId: string;
  view: ScoringRoundView;
  players: readonly ScoringPlayer[];
  holes: readonly HoleDefinition[];
  playerId: string;
  scorerId: string;
  selectedPlayer: ScoringPlayer | null;
  selectedScorer: ScoringPlayer | null;
  editingCard: Scorecard | null;
  editingPlayerName: string;
  /** Class, partner, team handicap, tee, group and the card's HDCP box, when the caller has them. */
  context?: ScorecardContext;
  profileRole?: ClubRole | null;
  canOpenProfile: boolean;
  busy: boolean;
  submitting: boolean;
  strokes: Record<number, string>;
  writtenOnCard: string;
  onWrittenOnCardChange: (value: string) => void;
  correctionReason: string;
  onCorrectionReasonChange: (value: string) => void;
  onPlayerChange: (playerId: string) => void;
  onScorerChange: (playerId: string) => void;
  onStrokeChange: (hole: number, value: string) => void;
  onEnter: (hole: number) => void;
  /** Enter in the card's HDCP box moves the desk into the grid: type the handicap, then the card. */
  onHandicapEnter?: () => void;
  /** Owner or organizer only: corrects the snapshot this round is scored from. */
  onCorrectHandicap?: () => void;
  scan: ScanCardReview;
  scanned: boolean;
  scanImage: ScorecardScanImage | null;
  scanConfirmed: boolean;
  onScanConfirmedChange: (value: boolean) => void;
  scanBlocked: boolean;
  submitNote: string;
  savedNote: string;
  onApplyScan: (apply: ScorecardScanApply) => void;
  /** Saves the card and stays on it, for a correction or a card that may need a second look. */
  onSubmit: () => void;
  /** Saves the card and opens the next card in the queue, from the keyboard. */
  onSubmitNext: () => void;
  onStartAnother: () => void;
  onFillPar: () => void;
  /**
   * The event's card rules, when the round is on them. Then the form asks for the HDCP on the card
   * instead of a marker, and Submit saves and approves the card.
   */
  eventRules?: EventScoringRules | null;
  cardHandicap?: string;
  onCardHandicapChange?: (value: string) => void;
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "info"; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

/** "card says 22" -> "Card says 22", for the start of a sentence. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ScorecardWorkspace({
  tournamentId,
  view,
  players,
  holes,
  playerId,
  scorerId,
  selectedPlayer,
  selectedScorer,
  editingCard,
  editingPlayerName,
  context,
  profileRole,
  canOpenProfile,
  busy,
  submitting,
  strokes,
  writtenOnCard,
  onWrittenOnCardChange,
  correctionReason,
  onCorrectionReasonChange,
  onPlayerChange,
  onScorerChange,
  onStrokeChange,
  onEnter,
  onHandicapEnter,
  onCorrectHandicap,
  scan,
  scanned,
  scanImage,
  scanConfirmed,
  onScanConfirmedChange,
  scanBlocked,
  submitNote,
  savedNote,
  onApplyScan,
  onSubmit,
  onSubmitNext,
  onStartAnother,
  onFillPar,
  eventRules = null,
  cardHandicap = "",
  onCardHandicapChange,
}: ScorecardWorkspaceProps) {
  const written = writtenOnCard.trim() === "" ? null : Number(writtenOnCard);
  // The playing handicap is the WHS figure for the player's registration index and tee. The HDCP
  // box is only a note beside it, so nothing the desk types there can change the net score.
  const cardBox = readCardBox(cardHandicap);
  const playerTee = selectedPlayer?.tee === undefined ? view.course.tee : selectedPlayer.tee;
  const eventHandicap = eventRules
    ? eventPlayingHandicap({
        index: selectedPlayer?.frozenIndex ?? null,
        tee: playerTee,
        rule: eventRules.handicap,
      })
    : null;
  const cardSnapshot =
    eventRules && eventHandicap?.ok && playerTee
      ? eventHandicapSnapshot({
          handicap: eventHandicap,
          rules: eventRules,
          tee: playerTee,
          effectiveDate: new Date().toISOString().slice(0, 10),
        })
      : null;
  const handicapProblem = eventHandicap && !eventHandicap.ok ? eventHandicap.message : null;
  const handicapFixLabel =
    eventHandicap && !eventHandicap.ok && eventHandicap.code === "no_tee"
      ? "Set the player's tee"
      : "Fix the handicap";
  // "card says 22, plays off 19 (index 16.4, White)" when the box disagrees with the WHS number.
  const cardNote =
    eventHandicap?.ok && playerTee
      ? cardBoxNote({
          box: cardBox,
          playingHandicap: eventHandicap.playingHandicap,
          index: eventHandicap.index,
          teeName: playerTee.name,
        })
      : null;
  const handicapHint = !eventRules
    ? ""
    : (handicapProblem ??
      (eventHandicap?.ok
        ? `${capitalise(
            cardNote ??
              `plays off ${eventHandicap.playingHandicap} (index ${eventHandicap.index}, ${playerTee?.name ?? "the registration tee"})`,
          )}.${eventHandicap.warning ? ` ${capitalise(eventHandicap.warning)}.` : ""}`
        : ""));
  const shownHandicap = eventRules ? cardSnapshot : (selectedPlayer?.handicap ?? null);
  const reviews: Record<number, ScorecardReviewState> = {};
  if (scanned) {
    for (const hole of holes) {
      const state = scan.cells[hole.number]?.state;
      reviews[hole.number] =
        state === "blank" ? "blank" : state === "check" && !scanConfirmed ? "check" : "ok";
    }
  }
  const readiness = scorecardReadiness({
    playerId,
    // The event does not record markers, so the form does not ask for one.
    scorerId: eventRules ? (editingCard?.scorerId ?? "") : scorerId,
    holes,
    strokes,
    reviews: scanned ? reviews : undefined,
    correction: Boolean(editingCard),
    correctionReason,
    markerRequired: !eventRules,
  });
  const blockers = [...readiness.blockers];
  if (handicapProblem) blockers.push(handicapProblem);
  if (scanBlocked && blockers.length === 0) blockers.push("Finish the scan checks");
  if (players.length < 2) blockers.unshift("At least two players are needed");
  const ready = readiness.ready && players.length >= 2 && blockers.length === 0;
  const statusLabel = ready
    ? "Ready to submit"
    : players.length < 2
      ? "At least two players are needed"
      : readiness.ready && handicapProblem
        ? handicapFixLabel
        : readiness.label;

  const summary = summariseScorecard({
    course: view.course,
    strokes,
    handicap: shownHandicap,
    writtenTotal: written,
  });
  const playingHandicapShown = shownHandicap?.playingHandicap ?? null;
  const gross = summary.gross;
  const out = summary.out;
  const inn = summary.in;
  const netPoints = summary.netPoints;
  const netStatus = summary.netStatus;
  const filled = summary.holesEntered;
  const writtenMatches = summary.writtenMatches;
  const pointsByHole: Record<number, number> = {};
  for (const hole of summary.holes) {
    pointsByHole[hole.hole] =
      summary.pointsKind === "net" ? (hole.netPoints ?? 0) : hole.grossPoints;
  }
  // Same wording as the public paper card: strokes first, then the pick-up count in brackets.
  const pickupSuffix =
    summary.pickups > 0
      ? ` (+${summary.pickups} ${summary.pickups === 1 ? "pickup" : "pickups"})`
      : "";
  const strokesText =
    filled === 18
      ? `${gross}${pickupSuffix}`
      : filled === 0
        ? "—"
        : `${gross} over ${filled} holes${pickupSuffix}`;

  const contextParts = buildCardContext({
    dayNumber: view.dayNumber,
    markerName: eventRules ? null : (selectedScorer?.playerName ?? null),
    playingHandicap: playingHandicapShown,
    cardHandicap: eventRules ? cardBox.value : context?.cardHandicap,
    className: context?.className,
    partnerName: context?.partnerName,
    teamHandicap: context?.teamHandicap,
    teeName: context?.teeName,
    groupLabel: context?.groupLabel,
  });

  return (
    <div className="flex flex-col gap-4">
      {/*
        Below `lg` this whole block dissolves (`contents`): the comboboxes and profile line scroll
        with the page inside their own card, and only the slim bar below stays stuck at the top.
        From `lg` up it is the one sticky card it always was, with Player and Marked by on the
        first row and the pill and Submit on the right.
      */}
      <div className="contents lg:sticky lg:top-[var(--shell-header)] lg:z-20 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_auto] lg:items-end lg:gap-2 lg:rounded-lg lg:border lg:border-line lg:bg-surface-raised lg:p-3 lg:shadow-sm">
        <div className="grid gap-2 rounded-lg border border-line bg-surface-raised p-3 shadow-sm lg:contents">
          <div className="grid gap-2 lg:contents">
            <Combobox
              label="Player"
              value={playerId}
              options={players.map((player) => ({ id: player.playerId, label: player.playerName }))}
              onChange={onPlayerChange}
              placeholder="Type a player's name"
              disabled={busy || players.length < 2 || Boolean(editingCard)}
            />
            {eventRules ? (
              <label className="field">
                <span>HDCP on card</span>
                <input
                  id="card-handicap"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={cardHandicap}
                  onChange={(event) => onCardHandicapChange?.(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    onHandicapEnter?.();
                  }}
                  placeholder="As written, e.g. 16.7"
                  aria-invalid={handicapProblem ? true : undefined}
                  aria-describedby="card-handicap-hint"
                  disabled={busy}
                />
              </label>
            ) : (
              <Combobox
                label="Marked by"
                value={scorerId}
                options={players
                  .filter((player) => player.playerId !== playerId)
                  .map((player) => ({ id: player.playerId, label: player.playerName }))}
                onChange={onScorerChange}
                placeholder="Type the marker's name"
                disabled={busy || players.length < 2 || Boolean(editingCard)}
              />
            )}
          </div>
          {eventRules && (
            <p
              id="card-handicap-hint"
              className={`hint m-0 lg:col-span-3 ${handicapProblem ? "text-danger" : ""}`}
              role="status"
            >
              {handicapHint}
              {handicapHint ? " " : ""}
              The card is scored with the WHS playing handicap from the registration index and tee,
              so the number in this box is a note only.
            </p>
          )}
          {!ready && blockers.length > 1 && (
            <p className="hint m-0 lg:col-span-3" role="status">
              {blockers.slice(1, 4).join(" · ")}
              {blockers.length > 4 ? " …" : ""}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-muted lg:col-span-3">
            {selectedPlayer && !eventRules && (
              <span>
                {selectedPlayer.playerName} · index {selectedPlayer.handicap?.index ?? "—"} · PH{" "}
                {selectedPlayer.handicap?.playingHandicap ?? "—"}
              </span>
            )}
            {selectedPlayer && canOpenProfile && (
              <Link
                href={playerProfileHref(selectedPlayer.playerId)}
                className="underline underline-offset-2"
              >
                Open profile
              </Link>
            )}
            {selectedScorer && !eventRules && <span>Marker: {selectedScorer.playerName}</span>}
          </div>
        </div>
        {/*
          The phone's stuck bar. It comes after the comboboxes in the DOM so Tab still goes
          Player, Marker, Save; `order-first` puts it at the top of the page below `lg`, and from
          `lg` up it is the third column of the sticky card. `bg-surface-raised` is solid so the
          card scrolling underneath never shows through.
        */}
        <div className="order-first sticky top-[var(--shell-header)] z-20 flex flex-col gap-1 rounded-lg border border-line bg-surface-raised p-2 shadow-sm lg:static lg:z-auto lg:col-start-3 lg:row-start-1 lg:order-none lg:flex-row lg:items-center lg:justify-end lg:gap-2 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <span className="truncate text-[13px] font-semibold text-ink lg:hidden">
            {selectedPlayer?.playerName ?? "No player selected"}
          </span>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Pill tone={ready ? "ok" : "warn"}>{statusLabel}</Pill>
            {!editingCard && (
              <Button
                id="score-submit-next"
                variant="primary"
                size="sm"
                className="min-h-11"
                onClick={onSubmitNext}
                disabled={!ready || busy || submitting}
                title="Saves this card and opens the next card in the queue."
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Saving card…
                  </>
                ) : eventRules ? (
                  "Save, approve and next"
                ) : (
                  "Save and next card"
                )}
              </Button>
            )}
            <Button
              id="score-submit"
              variant={editingCard ? "primary" : "secondary"}
              size="sm"
              className="min-h-11"
              onClick={onSubmit}
              disabled={!ready || busy || submitting}
              data-help="scores-submit"
            >
              {submitting && editingCard ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Saving card…
                </>
              ) : editingCard ? (
                eventRules ? (
                  "Save correction"
                ) : (
                  "Submit correction"
                )
              ) : eventRules ? (
                "Save and approve card"
              ) : (
                "Submit card"
              )}
            </Button>
          </div>
        </div>
      </div>

      {editingCard && (
        <div className="notice info grid gap-2" role="note">
          <p className="m-0 text-[13px]">
            <b>
              Correcting revision {editingCard.revision} for{" "}
              <PlayerLink
                playerId={editingCard.playerId}
                name={editingPlayerName}
                role={profileRole}
              />
              .
            </b>{" "}
            Saving writes a new revision; the old one stays in the audit and the new one needs
            approval.
          </p>
          <label className="field">
            <span>Correction reason (required)</span>
            <input
              type="text"
              value={correctionReason}
              onChange={(event) => onCorrectionReasonChange(event.target.value)}
              placeholder="What is being corrected?"
              aria-label="Correction reason"
              disabled={busy}
            />
          </label>
        </div>
      )}

      {submitNote && (
        <div className="notice info" role="status">
          <b>Already recorded. </b>
          {submitNote}
        </div>
      )}
      {savedNote && (
        <div className="notice ok" role="status">
          <b>Saved. </b>
          {savedNote}
        </div>
      )}
      {scanned && (
        <div className="notice warn" role="status">
          <b>Draft from the photo.</b> {scan.filled} of {holes.length} holes filled.
          {scan.check > 0 &&
            ` ${scan.check} ${scan.check === 1 ? "hole was" : "holes were"} read weakly and need checking against the photo.`}
          {scan.changed > 0 &&
            ` ${scan.changed} ${scan.changed === 1 ? "cell was" : "cells were"} changed by hand.`}
          {scan.typed > 0 &&
            ` ${scan.typed} ${scan.typed === 1 ? "cell was" : "cells were"} empty in the photo and typed in.`}
          {scan.blank > 0 &&
            ` ${scan.blank} ${scan.blank === 1 ? "hole is" : "holes are"} still blank.`}
        </div>
      )}

      <section
        id="scorecard-sheet"
        data-print="scorecard"
        aria-label="Scorecard"
        className="print-sheet-scope relative rounded-lg border border-line bg-surface-raised p-3 sm:p-5"
      >
        <img
          src="/brand/teeline-horizontal-primary.svg"
          alt="TeeLine Golf"
          className="hidden print:absolute print:top-0 print:right-0 print:block print:w-[25mm]"
        />
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3 print:items-start print:pr-[30mm] print:pb-2">
          <div className="grid gap-0.5">
            <h2 className="text-[18px] font-bold leading-tight text-ink">
              {selectedPlayer?.playerName ?? "Select a player"}
            </h2>
            <CardContextLine parts={contextParts} />
          </div>
          <div className="flex flex-wrap items-end gap-3 print:hidden">
            <label className="field w-36">
              <span>Total on card</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={200}
                value={writtenOnCard}
                onChange={(event) => onWrittenOnCardChange(event.target.value)}
                placeholder={gross ? String(gross) : "Optional"}
                disabled={busy}
              />
            </label>
            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden="true" />
              Print this card
            </Button>
            {scanned ? (
              <label className="flex min-h-11 items-center gap-2 text-[12px]">
                <input
                  type="checkbox"
                  checked={scanConfirmed}
                  onChange={(event) => onScanConfirmedChange(event.target.checked)}
                  disabled={busy}
                />
                <span>Checked against the paper card</span>
              </label>
            ) : (
              <span className="pill info">Entered by hand</span>
            )}
          </div>
        </div>

        <div className="mt-3">
          <ScorecardHoleGrid
            holes={holes}
            strokes={strokes}
            cells={scan.cells}
            scanned={scanned}
            disabled={busy}
            outTotal={out}
            inTotal={inn}
            outPoints={summary.outPoints}
            inPoints={summary.inPoints}
            points={pointsByHole}
            pointsKind={summary.pointsKind}
            onChange={onStrokeChange}
            onEnter={onEnter}
          />
        </div>

        {scanned && (scan.check > 0 || scan.blank > 0) && (
          <p id="scan-check-hint" className="hint m-0 mt-2 print:hidden">
            Amber cells were read with low confidence, and red cells were blank on the photo.
            Compare each one with the paper card. Correcting a cell marks it as changed; leaving a
            weak read as it is sends it to review unconfirmed.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-muted">
          <span>
            Strokes <b className="mono text-ink">{strokesText}</b>
          </span>
          <span>
            Holes with a score <b className="mono text-ink">{filled}/18</b>
          </span>
          {netStatus === "calculated" ? (
            <>
              <span>
                Playing handicap <b className="mono text-ink">{playingHandicapShown ?? "—"}</b>
              </span>
              <span>
                Net Stableford <b className="mono text-ink">{netPoints}</b>
              </span>
            </>
          ) : (
            <span className="text-warning">No handicap snapshot: net not calculated</span>
          )}
          <span>
            Gross Stableford <b className="mono text-ink">{summary.grossPoints}</b>
          </span>
          <span>
            OUT / IN / TOTAL{" "}
            <b className="mono text-ink">
              {out} / {inn} / {out + inn}
            </b>
          </span>
        </div>

        <p className="hint m-0 mt-1 print:hidden">
          {writtenMatches === null
            ? "Total on card is optional. Enter the total written on the paper card to compare it with the numbers above."
            : writtenMatches
              ? `The total on the card matches the numbers: ${gross}.`
              : `The card says ${written}, but the numbers add to ${gross}. Check the cells.`}
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 print:hidden">
          <div className="flex flex-wrap gap-2 print:hidden">
            {(editingCard || scanned) && (
              <Button variant="ghost" size="sm" onClick={onStartAnother} disabled={busy}>
                {editingCard ? "Cancel correction" : "Start another card"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onFillPar} disabled={busy}>
              Fill with par
            </Button>
          </div>
          <span className="hint">
            {ready ? (
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Ready to submit
              </span>
            ) : (
              statusLabel
            )}
          </span>
        </div>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <section
          id="score-scan-card"
          aria-labelledby="score-scan"
          data-help="scores-scan"
          className="grid content-start gap-3"
        >
          <h2 id="score-scan" className="sr-only">
            Scan a card
          </h2>
          <div className="overflow-hidden rounded-lg border border-line bg-surface-sunken">
            {scanImage ? (
              <img
                src={scanImage.previewUrl}
                alt="The scanned scorecard"
                className="max-h-[28rem] w-full object-contain"
              />
            ) : (
              <div className="grid gap-2 p-4">
                <ScanLine className="size-5 text-fairway" aria-hidden="true" />
                <b className="text-[14px]">No photo attached</b>
                <p className="hint m-0">
                  Enter the card by hand, or add a photo to check every cell against the paper.
                </p>
              </div>
            )}
          </div>
          <details className="card group" open={!scanImage}>
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
              <ScanLine className="size-4 text-fairway" aria-hidden="true" />
              {scanImage ? "Replace or rescan photo" : "Add photo or scan"}
            </summary>
            <div className="mt-3">
              <ScorecardScan
                tournamentId={tournamentId}
                role={profileRole}
                players={players.map((player) => ({
                  playerId: player.playerId,
                  playerName: player.playerName,
                }))}
                holes={holes}
                disabled={busy || Boolean(editingCard)}
                onApply={onApplyScan}
              />
            </div>
          </details>
        </section>
        {selectedPlayer && (
          <HandicapSummary
            playerId={selectedPlayer.playerId}
            playerName={selectedPlayer.playerName}
            role={profileRole}
            handicap={eventRules ? cardSnapshot : selectedPlayer.handicap}
            frozenIndex={selectedPlayer.frozenIndex}
            course={view.course}
            onCorrect={onCorrectHandicap}
          />
        )}
      </div>
    </div>
  );
}
