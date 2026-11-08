"use client";

import { ArrowLeft, Printer, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { NoticePoster, ShotgunGrid } from "@/components/print/P2Sheets";
import { Scorecards } from "@/components/print/Scorecards";
import { StartSheetTable } from "@/components/print/StartSheetTable";
import type { PrintGroup } from "@/components/print/types";
import { DayPills } from "@/components/staff/DayPills";
import { useStaffDay } from "@/components/staff/day-context";
import { StaffLoading } from "@/components/staff/StaffLoading";
import styles from "@/components/staff/staff.module.css";
import { useStaffRows } from "@/components/staff/use-rows";
import { courseDataStatus as deriveCourseDataStatus } from "@/lib/data/course-data";
import { fmtDateLabel, fmtIso } from "@/lib/data/labels";
import { fmtTime, photoOf } from "@/lib/format";
import { formatLine, splitIntoSessions, versionLine } from "@/lib/print/sheets";
import { useDesk } from "@/lib/store/desk-store";

type SheetKind = "start" | "grid" | "poster" | "scorecards";

const SHEETS: { id: SheetKind; label: string }[] = [
  { id: "start", label: "Start sheet" },
  { id: "grid", label: "Hole grid" },
  { id: "poster", label: "Poster" },
  { id: "scorecards", label: "Scorecards" },
];

/**
 * The staff print sheet. It prints the live board, not only the published list, so a starter can
 * print the pairings they are working from. The organizer print centre remains the place for counts,
 * the published pairings page and multi-day runs.
 */
export default function StaffPrintPage() {
  const {
    tournament,
    draw,
    players,
    regById,
    names,
    tees,
    holes,
    status,
    error: deskError,
    offline,
    reload,
    published,
  } = useDesk();
  const { day, days, notice, setDayNumber, session } = useStaffDay();
  const { schedule } = useStaffRows();
  const [kind, setKind] = useState<SheetKind>("start");
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [showFlight, setShowFlight] = useState(true);
  const [showTee, setShowTee] = useState(true);
  const [showHandicaps, setShowHandicaps] = useState(true);
  const [showQrCodes, setShowQrCodes] = useState(true);

  useEffect(() => {
    setExcluded(new Set());
  }, [day?.number]);

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );
  const printGroups = useMemo<PrintGroup[]>(
    () =>
      schedule.map((group) => ({
        number: group.number,
        startHole: group.startHole,
        time: group.time,
        flight: group.flightName,
        players: group.players.map(({ playerId }) => {
          const player = playerById.get(playerId);
          const registration = regById.get(playerId);
          const tee = registration?.teeId
            ? tees.find((candidate) => candidate.id === registration.teeId)
            : undefined;
          return {
            id: playerId,
            name: player?.name ?? "Unknown player",
            handicapIndex: registration?.frozenIndex ?? null,
            playingHandicap: registration?.playingHandicap ?? null,
            teeName: registration?.teeId ? (tee?.name ?? names.tee(registration.teeId)) : null,
            teeRating: tee?.courseRating ?? null,
            teeSlope: tee?.slope ?? null,
            ngapId: player?.ngapId ?? null,
            photo: player ? photoOf(player) : undefined,
          };
        }),
      })),
    [schedule, playerById, regById, tees, names],
  );

  const selectedGroups = printGroups.filter((group) => !excluded.has(group.number));
  const allSelected = printGroups.length > 0 && selectedGroups.length === printGroups.length;
  const courseDataStatus = tournament
    ? deriveCourseDataStatus({
        confirmed: tournament.courseDataConfirmed,
        tees,
        holes,
      })
    : "missing";
  const format = tournament
    ? formatLine(tournament.config.startFormat, fmtTime(tournament.config.firstTeeTime))
    : "";
  const stamp = versionLine(published);
  const paperDay = day
    ? { dayNumber: day.number, label: day.label, playDate: day.date }
    : null;
  const sheetGroups = selectedGroups.map((group) => ({
    ...group,
    dayNumber: day?.number ?? 1,
  }));
  // One sheet per AM/PM session, so a day's two sessions never share a page.
  const daySheets = splitIntoSessions(sheetGroups, paperDay ? [paperDay] : []);
  const shownSheets =
    session === "all" ? daySheets : daySheets.filter((sheet) => sheet.session === session);
  const subtitle = tournament
    ? `${tournament.name}${day ? ` · ${day.label}` : ""} · ${fmtDateLabel(tournament.dates)} · ${
        tournament.config.startFormat === "shotgun" ? "Shotgun start" : "Two-tee start"
      } · first tee ${fmtTime(tournament.config.firstTeeTime)}`
    : "";

  function toggleGroup(number: number) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  }

  function printNow() {
    if (selectedGroups.length === 0) return;
    window.print();
  }

  if (status === "loading") {
    return <StaffLoading title="Print" label="Loading the print sheet" />;
  }

  if (deskError && !offline) {
    return (
      <div className={styles.blockError} role="alert">
        <b>The print sheet did not load.</b>
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
      <h1 className={`${styles.h1} ${styles.noPrint}`}>Print</h1>
      <p className={`${styles.sub} ${styles.noPrint}`}>
        {tournament.name} · live board · {selectedGroups.length} of {printGroups.length} groups
      </p>

      <div className={`${styles.toolRow} ${styles.noPrint}`}>
        <Link className={styles.toolLink} href="/staff/schedule">
          <ArrowLeft aria-hidden="true" size={18} />
          Schedule
        </Link>
        <Link className={styles.toolLink} href="/staff/pairings">
          <SlidersHorizontal aria-hidden="true" size={18} />
          Pairings
        </Link>
      </div>

      <div className={styles.noPrint}>
        <DayPills days={days} selected={day?.number ?? null} onSelect={setDayNumber} />
        {notice && <p className={styles.notice}>{notice}</p>}
      </div>

      {!draw || printGroups.length === 0 ? (
        <p className={`${styles.notice} ${styles.noticeWarn}`}>
          There is nothing to print for this day yet.{" "}
          <Link href="/staff/pairings">Create or edit the pairings first.</Link>
        </p>
      ) : (
        <>
          <section className={`${styles.card} ${styles.noPrint}`} style={{ marginTop: 14 }}>
            <div className={styles.sectionHead} style={{ marginTop: 0 }}>
              <h2>What to print</h2>
              <span>{selectedGroups.length} selected</span>
            </div>

            <div className={styles.choiceGrid} role="group" aria-label="Sheet type">
              {SHEETS.map((sheet) => (
                <button
                  key={sheet.id}
                  type="button"
                  className={styles.choice}
                  aria-pressed={kind === sheet.id}
                  onClick={() => setKind(sheet.id)}
                >
                  {sheet.label}
                </button>
              ))}
            </div>

            <div className={styles.sectionHead}>
              <h2>Fields</h2>
            </div>
            <div className={styles.printOptions}>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={showFlight}
                  onChange={(event) => setShowFlight(event.target.checked)}
                />
                Flight on every group
              </label>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={showTee}
                  onChange={(event) => setShowTee(event.target.checked)}
                />
                Tee on every player
              </label>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={showHandicaps}
                  onChange={(event) => setShowHandicaps(event.target.checked)}
                />
                Handicap index and playing handicap
              </label>
              {kind === "scorecards" && (
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={showQrCodes}
                    onChange={(event) => setShowQrCodes(event.target.checked)}
                  />
                  Player QR codes
                </label>
              )}
            </div>

            <div className={styles.sectionHead}>
              <h2>Groups</h2>
              <button
                type="button"
                className={styles.linkButton}
                style={{ minHeight: 48, padding: "0 12px" }}
                onClick={() =>
                  setExcluded(allSelected ? new Set(printGroups.map((g) => g.number)) : new Set())
                }
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className={styles.printGroupList}>
              {printGroups.map((group) => (
                <label key={group.number} className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={!excluded.has(group.number)}
                    onChange={() => toggleGroup(group.number)}
                  />
                  Group {group.number} · {group.players.length} players
                </label>
              ))}
            </div>

            {selectedGroups.length === 0 && (
              <p className={styles.noticeWarn} style={{ padding: 12, borderRadius: 12 }}>
                Choose at least one group above, or use Select all.
              </p>
            )}
          </section>

          <div className={`${styles.stickyActionBar} ${styles.noPrint}`}>
            <button
              type="button"
              className={styles.primary}
              disabled={selectedGroups.length === 0}
              onClick={printNow}
            >
              <Printer aria-hidden="true" size={20} style={{ marginRight: 8 }} />
              Print {selectedGroups.length} group{selectedGroups.length === 1 ? "" : "s"}
            </button>
          </div>
          <p className={`${styles.saving} ${styles.noPrint}`} style={{ margin: "8px 0 0" }}>
            The browser print dialog handles paper size, orientation and copies.
          </p>

          <p className={`${styles.muted} ${styles.noPrint}`} style={{ margin: "14px 0 6px" }}>
            This is the paper. Each session starts a new sheet, and long fields run on numbered
            pages.
          </p>
          <div
            className={`${styles.printArea} print-sheet-scope`}
            role="region"
            aria-label="Print preview"
            tabIndex={0}
          >
            {kind === "grid" && (
              <style>{"@page { size: A4 landscape; margin: 8mm; }"}</style>
            )}
            {kind === "scorecards" ? (
              <Scorecards
                title={tournament.name}
                subtitle={subtitle}
                hostName={tournament.hostName}
                logoUrl={tournament.logoUrl}
                groups={selectedGroups}
                holes={holes}
                startFormat={tournament.config.startFormat}
                courseDataStatus={courseDataStatus}
                showQrCodes={showQrCodes}
              />
            ) : shownSheets.length === 0 ? (
              <p className={styles.notice}>
                No {session === "all" ? "" : `${session} `}groups are selected for this day.
              </p>
            ) : (
              shownSheets.map((sheet) =>
                kind === "start" ? (
                  <StartSheetTable
                    key={sheet.key}
                    eventName={tournament.name}
                    title="Start sheet"
                    dayLabel={sheet.label}
                    formatLine={format}
                    versionLine={stamp}
                    groups={sheet.groups}
                    startFormat={tournament.config.startFormat}
                    courseDataStatus={courseDataStatus}
                    showFlight={showFlight}
                    showTee={showTee}
                    showHandicaps={showHandicaps}
                  />
                ) : kind === "grid" ? (
                  <ShotgunGrid
                    key={sheet.key}
                    eventName={tournament.name}
                    title="Hole grid"
                    dayLabel={sheet.label}
                    formatLine={format}
                    versionLine={stamp}
                    groups={sheet.groups}
                    startFormat={tournament.config.startFormat}
                  />
                ) : (
                  <NoticePoster
                    key={sheet.key}
                    eventName={tournament.name}
                    title="Notice board"
                    dayLabel={sheet.label}
                    formatLine={format}
                    versionLine={stamp}
                    groups={sheet.groups}
                    startFormat={tournament.config.startFormat}
                  />
                ),
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
