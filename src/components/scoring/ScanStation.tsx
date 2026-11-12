"use client";

import {
  ArrowRight,
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileJson,
  ScanLine,
  Send,
  ShieldCheck,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { ScoresSubnav } from "@/components/scoring/ScoresSubnav";
import { DayPills } from "@/components/staff/DayPills";
import { useStaffDay } from "@/components/staff/day-context";
import type { ScoringRoundView } from "@/lib/data/scoring";
import { reciprocalRotation } from "@/lib/scoring";
import {
  buildScorecardImportTemplate,
  parseScorecardImport,
  type ScorecardImportFile,
  type ScorecardImportProblem,
  type ScorecardImportTemplate,
} from "@/lib/scoring/import";
import { SCAN_STATION_STEPS } from "@/lib/scoring/scan/station";
import { useDesk } from "@/lib/store/desk-store";

type ScanStationMode = "desk" | "staff";

interface ScanStationProps {
  mode: ScanStationMode;
  tournamentName: string;
  dayLabel: string;
  dayNumber: number | null;
  /** The staff day chips. The desk keeps its day control on the Scores screen. */
  dayPicker?: ReactNode;
}

function StepIcon({ step }: { step: (typeof SCAN_STATION_STEPS)[number] }) {
  if (step.key === "capture") return <Camera aria-hidden="true" />;
  if (step.key === "read") return <ScanLine aria-hidden="true" />;
  if (step.key === "verify") return <ClipboardCheck aria-hidden="true" />;
  return <Send aria-hidden="true" />;
}

function StepCard({
  step,
  index,
  active,
}: {
  step: (typeof SCAN_STATION_STEPS)[number];
  index: number;
  active: boolean;
}) {
  return (
    <div
      className={`grid content-start gap-2 rounded-lg border p-3 ${
        active ? "border-fairway bg-fairway-soft" : "border-line bg-surface"
      }`}
    >
      <span className="flex items-center gap-2">
        <span
          className={`grid size-6 place-items-center rounded-full text-[12px] font-bold ${
            active ? "bg-fairway text-white" : "bg-surface-sunken text-ink-muted"
          }`}
        >
          {index + 1}
        </span>
        <span className={active ? "text-fairway [&_svg]:size-4" : "text-ink-muted [&_svg]:size-4"}>
          <StepIcon step={step} />
        </span>
      </span>
      <b className="text-[14px] leading-tight">{step.title}</b>
      <span className="text-[12px] leading-snug text-ink-muted">{step.body}</span>
    </div>
  );
}

function Rule({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

/**
 * The scan station shell. The camera, reader and export are deliberately not wired here yet.
 * This screen proves the route, the four steps and the one hard rule: every hole needs a value.
 */
export function ScanStation({
  mode,
  tournamentName,
  dayLabel,
  dayNumber,
  dayPicker,
}: ScanStationProps) {
  const { scoring, tournament, member } = useDesk();
  const [roundView, setRoundView] = useState<ScoringRoundView | null>(null);
  const [roundLoading, setRoundLoading] = useState(false);
  const [roundError, setRoundError] = useState("");
  const [importedFile, setImportedFile] = useState<ScorecardImportFile | null>(null);
  const [importProblems, setImportProblems] = useState<ScorecardImportProblem[]>([]);
  const [importName, setImportName] = useState("");
  const [jsonMessage, setJsonMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const tournamentId = tournament?.id ?? "";
    if (!tournamentId || dayNumber === null) {
      setRoundView(null);
      setRoundError("");
      setRoundLoading(false);
      return;
    }
    let cancelled = false;
    setRoundLoading(true);
    setRoundError("");
    scoring
      .loadRound(tournamentId, dayNumber)
      .then((next) => {
        if (cancelled) return;
        setRoundView(next);
        setRoundLoading(false);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setRoundView(null);
        setRoundError(reason instanceof Error ? reason.message : String(reason));
        setRoundLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scoring, tournament?.id, dayNumber]);

  const liveHref = mode === "desk" ? "/scores" : "/staff/score";
  const liveLabel = mode === "desk" ? "Open the live card desk" : "Back to the group list";
  const mismatch =
    importedFile !== null &&
    roundView !== null &&
    (importedFile.tournamentId !== roundView.tournamentId ||
      importedFile.roundId !== roundView.roundId ||
      importedFile.dayNumber !== roundView.dayNumber);

  function templateForRound(): ScorecardImportTemplate | null {
    if (!roundView) return null;
    const players = roundView.players.map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
    }));
    const template = buildScorecardImportTemplate({
      tournamentId: roundView.tournamentId,
      roundId: roundView.roundId,
      dayNumber: roundView.dayNumber,
      players,
      groups: null,
      holes: roundView.course.holes,
      markers: reciprocalRotation(players.map((player) => player.playerId)),
    });
    template.extractedBy = member?.displayName?.trim() || "Scan station";
    template.extractedAt = new Date().toISOString();
    return template;
  }

  async function importJson(file: File | null) {
    setImportName(file?.name ?? "");
    setImportedFile(null);
    setImportProblems([]);
    setJsonMessage("");
    if (!file) return;
    try {
      const parsed = parseScorecardImport(JSON.parse(await file.text()), {
        strokeLimits: roundView?.strokeLimits,
      });
      setImportProblems(parsed.problems);
      if (parsed.file) {
        setImportedFile(parsed.file);
        setJsonMessage(
          `Read ${parsed.file.cards.length} card(s) from ${file.name}. ${parsed.problems.length === 0 ? "No structural problems." : `${parsed.problems.length} problem(s) below.`}`,
        );
      } else {
        setJsonMessage("The file cannot be used because a top-level field is wrong.");
      }
    } catch (reason) {
      setJsonMessage(
        reason instanceof SyntaxError
          ? "That file is not valid JSON."
          : reason instanceof Error
            ? reason.message
            : String(reason),
      );
    }
  }

  function exportJson() {
    const file = importedFile ?? templateForRound();
    if (!file) {
      setJsonMessage("Open a scoring round before exporting a template.");
      return;
    }
    const text = JSON.stringify(file, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `scorecard-scan-day-${file.dayNumber}-${importedFile ? "imported" : "template"}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setJsonMessage(
      importedFile
        ? `Exported ${importedFile.cards.length} imported card(s).`
        : `Downloaded a blank template for ${roundView?.players.length ?? 0} player(s). Fill every hole before importing it.`,
    );
  }

  const body = (
    <div className="grid gap-5">
      <div className="notice info" role="note">
        <b>Scaffold only. </b>
        The camera, reader and score export are not wired on this screen yet. Use the live card desk
        for today&apos;s cards. The workflow and the export rule below are the contract the next
        phase will implement.{" "}
        <a href="#scan-json" className="font-semibold underline underline-offset-2">
          Import or export a JSON file
        </a>
        .
      </div>

      <div className="card grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-fairway-soft text-fairway">
            <CalendarDays className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <b className="truncate">{tournamentName}</b>
            <span className="hint">{dayLabel}</span>
            <span className="hint">
              Every playing day has its own round. Choose the day before a card is scanned.
            </span>
          </div>
        </div>
        {mode === "staff" ? (
          <span className="pill ok">Day chips select the round</span>
        ) : (
          <span className="pill warn">Day selector arrives with the wired workflow</span>
        )}
      </div>

      <section aria-labelledby="scan-steps" className="grid gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="overline m-0">Workflow</p>
            <h2 id="scan-steps" className="m-0 text-[18px]">
              Four steps, one card at a time
            </h2>
          </div>
          <span className="pill info">Step 1 of 4</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {SCAN_STATION_STEPS.map((step, index) => (
            <StepCard key={step.key} step={step} index={index} active={index === 0} />
          ))}
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <SectionCard
          id="scan-capture"
          icon={<Camera />}
          title="Capture the first card"
          subtitle="The photo is the evidence. The reader only proposes values; a person checks them."
        >
          <div className="grid gap-3">
            {importedFile ? (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-[14px]">
                    {importedFile.cards.length} {importedFile.cards.length === 1 ? "card" : "cards"}{" "}
                    read from the file
                  </b>
                  <span className="pill info">Day {importedFile.dayNumber}</span>
                  <span className="pill">{importedFile.extractedBy || "No transcriber named"}</span>
                </div>
                {importedFile.cards.length === 0 ? (
                  <p className="m-0 text-[13px] text-ink-muted">The file has no cards.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Player</th>
                          <th scope="col">Group</th>
                          <th scope="col">Marker</th>
                          <th scope="col">Holes</th>
                          <th scope="col">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importedFile.cards.slice(0, 8).map((card) => (
                          <tr key={card.cardKey}>
                            <td>{card.playerName ?? card.playerId ?? "Unnamed"}</td>
                            <td className="mono">{card.groupNumber ?? "—"}</td>
                            <td>{card.markerName ?? card.markerPlayerId ?? "—"}</td>
                            <td className="mono">{Object.keys(card.holes).length}/18</td>
                            <td className="mono">{card.writtenTotal ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importedFile.cards.length > 8 && (
                      <p className="hint m-0 pt-2">
                        Showing the first 8. {importedFile.cards.length - 8} more in the file.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-line-strong bg-surface-sunken p-5 text-center">
                <div className="grid max-w-sm justify-items-center gap-2">
                  <ScanLine className="size-7 text-fairway" aria-hidden="true" />
                  <b>No card in this batch yet</b>
                  <span className="hint">
                    Use the camera or upload in the next phase, or import a JSON transcription below
                    to see the batch.
                  </span>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn small" disabled>
                <Camera className="size-4" aria-hidden="true" />
                Take photo
              </button>
              <button type="button" className="btn ghost small" disabled>
                <Upload className="size-4" aria-hidden="true" />
                Upload a photo
              </button>
              <Link className="btn ghost small no-underline" href={liveHref}>
                {liveLabel}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <p className="hint m-0">
              A card is never added to the batch until every hole has a value. The batch button is
              disabled in this scaffold because the batch is empty.
            </p>
          </div>
        </SectionCard>

        <div className="grid gap-5">
          <SectionCard
            id="scan-export-rule"
            icon={<ShieldCheck />}
            title="The export rule"
            subtitle="The one hard rule. Everything else is a warning."
          >
            <ul className="m-0 grid list-none gap-2 p-0 text-[13px]">
              <Rule>Editing is never blocked. Any cell can be changed at any time.</Rule>
              <Rule>
                <b>X</b> counts as a recorded hole. A blank cell does not.
              </Rule>
              <Rule>All 18 holes need a value before a card can be exported.</Rule>
              <Rule>
                Weak reads, a written-total mismatch and an existing card are warnings, not blocks.
              </Rule>
              <Rule>
                Export submits cards. Approval stays in <b>/scores/review</b>.
              </Rule>
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="btn small" disabled>
                <Send className="size-4" aria-hidden="true" />
                Export 0 cards
              </button>
              <span className="pill warn">Nothing to export yet</span>
            </div>
          </SectionCard>

          <SectionCard
            id="scan-destination"
            icon={<ClipboardCheck />}
            title="Where the data goes"
            subtitle="The same scoring queue the desk already uses."
          >
            <p className="m-0 text-[13px]">
              Each exported card is submitted through the existing scoring repository. It appears in
              the Cards table as <b>submitted</b>, keeps its photo and reader metadata, and still
              needs the ordinary approval. A repeated export uses the same capture key, so a retry
              does not create a second revision.
            </p>
            {mode === "desk" ? (
              <Link
                className="btn ghost small mt-3 justify-self-start no-underline"
                href="/scores/review"
              >
                Open Review
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <p className="hint mt-3">
                The organizer approves submitted cards from the desk. Ask them to open Scores then
                Review.
              </p>
            )}
          </SectionCard>
        </div>
      </div>

      <SectionCard
        id="scan-json"
        icon={<FileJson />}
        title="JSON import and export"
        subtitle="The same file format as Scores > Review. Use it to hand a batch to someone else or recover it."
      >
        <div
          className="grid gap-3"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void importJson(event.dataTransfer.files?.[0] ?? null);
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn small" onClick={() => fileInput.current?.click()}>
              <Upload className="size-4" aria-hidden="true" />
              Import JSON
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                void importJson(file);
              }}
            />
            <button
              type="button"
              className="btn ghost small"
              onClick={exportJson}
              disabled={!importedFile && !roundView}
            >
              <Download className="size-4" aria-hidden="true" />
              Export JSON
            </button>
            {importedFile && (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  setImportedFile(null);
                  setImportProblems([]);
                  setImportName("");
                  setJsonMessage("");
                }}
              >
                Clear imported file
              </button>
            )}
            {roundLoading && <span className="pill info">Loading round…</span>}
          </div>
          <p className="hint m-0">
            Import reads a <b>teeline-scorecard-import</b> file. Export after an import returns that
            file. With nothing imported it downloads a blank template for the open round, which must
            be filled before it can be imported again.
          </p>
          {roundError && (
            <div className="notice warn" role="status">
              The round could not be loaded, so a blank template cannot be built. {roundError}
            </div>
          )}
          {mismatch && (
            <div className="notice warn" role="status">
              This file names another tournament, round or day. It is shown for preview only.
            </div>
          )}
          {jsonMessage && (
            <div className={`notice ${importProblems.length > 0 ? "warn" : "info"}`} role="status">
              {jsonMessage}
            </div>
          )}
          {importName && <p className="hint m-0">File: {importName}</p>}
          {importProblems.length > 0 && (
            <div className="notice bad" role="alert">
              <b>{importProblems.length} problem(s) in the file.</b>
              <ul className="m-0 grid gap-1 pl-5 text-[13px]">
                {importProblems.slice(0, 8).map((problem) => (
                  <li key={`${problem.path}:${problem.message}`}>
                    {problem.path ? <b className="mono">{problem.path}</b> : null}
                    {problem.path ? " " : null}
                    {problem.message}
                  </li>
                ))}
                {importProblems.length > 8 && <li>{importProblems.length - 8} more.</li>}
              </ul>
            </div>
          )}
        </div>
      </SectionCard>

      <div className="notice warn" role="note">
        <b>X cards are not exportable yet. </b>
        The scoring table records a stroke number on every hole and has no pick-up field. Until the
        owner approves that addition, enter X cards in the live card desk. The plan contains the
        proposed fix.
      </div>
    </div>
  );

  if (mode === "staff") {
    return (
      <div className="grid gap-4">
        <header className="grid gap-1">
          <p className="overline m-0">Staff scoring</p>
          <h1 className="m-0 text-[28px] leading-tight">Scan a card</h1>
          <p className="m-0 text-ink-muted">Photo, verify, export. The group list is on Score.</p>
        </header>
        {dayPicker}
        {body}
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        overline="Scoring"
        title="Scan a card"
        crumbs={[
          { label: "Tournament desk", href: "/admin" },
          { label: "Scores", href: "/scores" },
          { label: "Scan a card" },
        ]}
        actions={
          <Link className="btn ghost small no-underline" href="/scores">
            Open the card desk
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        }
      >
        Photo, read, verify and export a paper card. The exported cards still need approval.
      </PageHeader>
      <ScoresSubnav active="scan" />
      {body}
    </div>
  );
}

/** Desk wrapper: the selected desk day is the station day. */
export function DeskScanStation() {
  const { tournament, drawDay } = useDesk();
  return (
    <ScanStation
      mode="desk"
      tournamentName={tournament?.name ?? "No event selected"}
      dayLabel={drawDay ? `Playing day ${drawDay}` : "No playing day selected"}
      dayNumber={drawDay ?? null}
    />
  );
}

/** Staff wrapper: the staff day pills own the selected day. */
export function StaffScanStation() {
  const { tournament } = useDesk();
  const { day, days, setDayNumber } = useStaffDay();
  return (
    <ScanStation
      mode="staff"
      tournamentName={tournament?.name ?? "No event selected"}
      dayLabel={day ? `Playing day ${day.number}` : "No playing day selected"}
      dayNumber={day?.number ?? null}
      dayPicker={<DayPills days={days} selected={day?.number ?? null} onSelect={setDayNumber} />}
    />
  );
}
