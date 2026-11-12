"use client";

import {
  ArrowRight,
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ScanLine,
  Send,
  ShieldCheck,
  Upload,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { ScoresSubnav } from "@/components/scoring/ScoresSubnav";
import { DayPills } from "@/components/staff/DayPills";
import { useStaffDay } from "@/components/staff/day-context";
import { SCAN_STATION_STEPS } from "@/lib/scoring/scan/station";
import { useDesk } from "@/lib/store/desk-store";

type ScanStationMode = "desk" | "staff";

interface ScanStationProps {
  mode: ScanStationMode;
  tournamentName: string;
  dayLabel: string;
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
export function ScanStation({ mode, tournamentName, dayLabel, dayPicker }: ScanStationProps) {
  const liveHref = mode === "desk" ? "/scores" : "/staff/score";
  const liveLabel = mode === "desk" ? "Open the live card desk" : "Back to the group list";

  const body = (
    <div className="grid gap-5">
      <div className="notice info" role="note">
        <b>Scaffold only. </b>
        The camera, reader and export are not wired on this screen yet. Use the live card desk for
        today&apos;s cards. The workflow and the export rule below are the contract the next phase
        will implement.
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
            <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-line-strong bg-surface-sunken p-5 text-center">
              <div className="grid max-w-sm justify-items-center gap-2">
                <ScanLine className="size-7 text-fairway" aria-hidden="true" />
                <b>No card in this batch yet</b>
                <span className="hint">
                  The next phase reuses the existing camera, signed upload and reader from the
                  Scores card desk.
                </span>
              </div>
            </div>
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
      dayPicker={<DayPills days={days} selected={day?.number ?? null} onSelect={setDayNumber} />}
    />
  );
}
