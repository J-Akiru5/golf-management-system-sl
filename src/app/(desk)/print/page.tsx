"use client";

import {
  CircleHelp,
  FileText,
  Flag,
  Printer,
  Smartphone,
  TableProperties,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheatSheet } from "@/components/help";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader } from "@/components/PageHeader";
import { type CountsGrouping, DayCounts } from "@/components/print/DayCounts";
import { ExportBar, type ExportFormat } from "@/components/print/ExportBar";
import { PairingsSheet } from "@/components/print/PairingsSheet";
import { ResultsSheet as ResultsSheetView } from "@/components/print/ResultsSheet";
import { Scorecards } from "@/components/print/Scorecards";
import { StartSheet } from "@/components/print/StartSheet";
import type { PrintGroup } from "@/components/print/types";
import { Button } from "@/components/ui/button";
import { courseDataStatus as deriveCourseDataStatus } from "@/lib/data/course-data";
import { playingDaysOf } from "@/lib/data/dates";
import { fmtDateLabel, fmtIso } from "@/lib/data/labels";
import { toPublicPairings } from "@/lib/data/public";
import type { ScoringRoundView } from "@/lib/data/scoring";
import {
  daySessionSummary,
  type SessionKey,
  sessionForTimeIn,
  sessionsForDay,
} from "@/lib/data/sessions";
import { downloadBlob } from "@/lib/export/download";
import { photoOf } from "@/lib/format";
import { buildDayCountBlocks, buildGroupBlocks } from "@/lib/print/day-counts";
import { draftPairings as buildDraftPairings } from "@/lib/print/draft-pairings";
import {
  type BoardScope,
  buildPrintBook,
  KIND_LABEL,
  printFileName,
} from "@/lib/print/export-book";
import { courseNote, pairingsForDay } from "@/lib/print/export-model";
import { buildResultsSheet, resultsPlayersFromRound } from "@/lib/print/results-sheet";
import { UNCLASSIFIED_LABEL } from "@/lib/routing";
import { useDesk } from "@/lib/store/desk-store";
import { isUnclassifiedGroup } from "@/lib/store/state";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/ui/cn";

type Tab = "start" | "counts" | "pairings" | "scorecards" | "results" | "howto";

const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "start", label: "Start sheet", icon: TableProperties },
  { id: "counts", label: "Counts", icon: Users },
  { id: "pairings", label: "Pairings", icon: Flag },
  { id: "scorecards", label: "Scorecards", icon: FileText },
  { id: "results", label: "Results", icon: Trophy },
  { id: "howto", label: "How to", icon: CircleHelp },
];

export default function PrintCenter() {
  const {
    tournament,
    draw,
    players,
    regById,
    registrations,
    entries,
    entryByPlayer,
    names,
    tees,
    holes,
    published,
    changedSincePublish,
    days,
    drawDay,
    setDrawDay,
    scoring,
  } = useDesk();
  const [tab, setTab] = useState<Tab>("start");
  // Printing follows the desk's day: picking a day here loads that day's board, so the sheets never
  // mix two days together. Playing days only, in day order, so a trailing non-playing day does not
  // make the last playing day's afternoon read as an ordinary day.
  const playingDays = useMemo(() => playingDaysOf(days), [days]);
  const chosenDay = playingDays.find((d) => d.dayNumber === drawDay) ?? null;
  // Every day at once, fetched on demand: the desk itself only holds the selected day.
  const [everyDay, setEveryDay] = useState<{ day: number; groups: PrintGroup[] }[] | null>(null);
  const [preparingAll, setPreparingAll] = useState(false);
  // The selector's "All playing days" choice. The cached boards above are only the data; this is
  // what the screen and every download follow, so a file always matches the day that is shown.
  const [allDays, setAllDays] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState("");
  // The organisers read the same players two ways: by AM/PM session, or by the draw's groups.
  const [groupBy, setGroupBy] = useState<CountsGrouping>("session");
  // Results follow one round at a time. Day 1 is split into its two sessions; every other day is
  // one table for the whole round.
  const [resultsSession, setResultsSession] = useState<SessionKey | "all">("all");
  const [resultsRound, setResultsRound] = useState<ScoringRoundView | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState("");
  // The organisers' headcount: players per playing day, split into AM and PM, with tee-off times.
  const countBlocks = useMemo(
    () =>
      buildDayCountBlocks({
        days: playingDays.map((d) => ({
          dayNumber: d.dayNumber,
          label: d.label,
          playDate: d.playDate,
        })),
        entries: entries.map((entry) => ({
          entryId: entry.id,
          playerId: entry.playerId,
          selectedDays: entry.selectedDays,
          daySessions: entry.daySessions,
          dayTee: entry.dayTee,
        })),
        players,
        boards: everyDay,
      }),
    [playingDays, entries, everyDay, players],
  );
  const groupBlocks = useMemo(
    () =>
      buildGroupBlocks({
        days: playingDays.map((d) => ({
          dayNumber: d.dayNumber,
          label: d.label,
          playDate: d.playDate,
        })),
        boards: everyDay,
      }),
    [playingDays, everyDay],
  );

  const tournamentId = tournament?.id ?? null;
  // Results are read one day at a time. The scoring repository keeps the day's entries and the
  // cards, so the sheet is built from the same engine the Scores screen uses, never from a guess.
  useEffect(() => {
    if (tab !== "results" || !tournamentId || !chosenDay) {
      setResultsRound(null);
      setResultsError("");
      setResultsLoading(false);
      return;
    }
    let active = true;
    setResultsLoading(true);
    setResultsError("");
    scoring
      .loadRound(tournamentId, chosenDay.dayNumber)
      .then((round) => {
        if (active) setResultsRound(round);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setResultsRound(null);
        setResultsError(
          error instanceof Error ? error.message : "Could not read this day's results.",
        );
      })
      .finally(() => {
        if (active) setResultsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, tournamentId, chosenDay, scoring]);

  const publishedPairings = useMemo(() => {
    if (!tournament) return null;
    const source = published ?? null;
    if (!source) return null;
    return toPublicPairings({
      published: source,
      tournamentName: tournament.name,
      dateLabel: fmtDateLabel(tournament.dates),
      startFormat: tournament.config.startFormat,
      firstTeeTime: tournament.config.firstTeeTime,
    });
  }, [tournament, published]);

  if (!tournament) return <NeedsTournament what="The print center" />;

  const playerById = new Map(players.map((p) => [p.id, p]));
  const shotgun = tournament.config.startFormat === "shotgun";
  const dayGroups = draw ?? [];
  const groups = dayGroups;
  // This existing route remains the assembler: adapt the desk's domain objects into plain print props here.
  const toPrintGroup = (group: {
    number: number;
    startHole: number;
    time: string;
    flightId: string;
    playerIds: string[];
  }): PrintGroup => ({
    number: group.number,
    startHole: group.startHole,
    time: group.time,
    flight: isUnclassifiedGroup(group.playerIds, regById)
      ? UNCLASSIFIED_LABEL
      : names.flight(group.flightId),
    players: group.playerIds.map((id) => {
      const player = playerById.get(id);
      const registration = regById.get(id);
      const tee = registration?.teeId
        ? tees.find((item) => item.id === registration.teeId)
        : undefined;
      return {
        id,
        name: player?.name ?? "Unknown player",
        handicapIndex: registration?.frozenIndex ?? null,
        playingHandicap: registration?.playingHandicap ?? null,
        // The tee and its numbers go on the card: the course handicap beside them comes off them.
        teeName: registration?.teeId ? (tee?.name ?? names.tee(registration.teeId)) : null,
        teeRating: tee?.courseRating ?? null,
        teeSlope: tee?.slope ?? null,
        ngapId: player?.ngapId ?? null,
        photo: player ? photoOf(player) : undefined,
      };
    }),
  });
  const printGroups = groups.map(toPrintGroup);

  // The session a player actually played in on the selected day: the draw's group first, then the
  // desk's recorded choice, then a confirmed tee time. Nothing is given a session by default.
  const daySessions = sessionsForDay(chosenDay ?? {}, {
    eventPmStart: tournament.config.pmFirstTeeTime,
    finalDay: chosenDay?.dayNumber === playingDays[playingDays.length - 1]?.dayNumber,
  });
  const sessionOfPlayer = (playerId: string): SessionKey | null => {
    if (!chosenDay) return null;
    const group = groups.find((candidate) => candidate.playerIds.includes(playerId));
    if (group) {
      const wave = group.wave ? /(?:^|[-_ ])(AM|PM)(?:$|[-_ ])/i.exec(group.wave)?.[1] : null;
      if (wave === "AM" || wave === "PM") return wave;
      const fromGroup = sessionForTimeIn(daySessions, group.time);
      if (fromGroup) return fromGroup.key;
    }
    const entry = entryByPlayer.get(playerId);
    const chosen = entry?.daySessions?.[chosenDay.dayNumber];
    if (chosen === "AM" || chosen === "PM") return chosen;
    const teeTime = entry?.dayTee?.[chosenDay.dayNumber]?.teeTime ?? null;
    if (teeTime) {
      const fromTee = sessionForTimeIn(daySessions, teeTime);
      if (fromTee) return fromTee.key;
    }
    return null;
  };
  const resultsSheet =
    chosenDay && resultsRound
      ? buildResultsSheet({
          eventName: tournament.name,
          dayNumber: chosenDay.dayNumber,
          dayLabel: chosenDay.label,
          playDate: chosenDay.playDate,
          dateLabel: fmtIso(chosenDay.playDate),
          players: resultsPlayersFromRound(resultsRound, sessionOfPlayer),
          splitBySession: chosenDay.dayNumber === 1,
          session: resultsSession,
        })
      : null;
  const resultsTablesCount = resultsSheet?.tables.length ?? 0;
  const resultsPlayersCount =
    resultsSheet?.tables.reduce((sum, table) => sum + table.rows.length, 0) ?? 0;
  const resultsMissingCards =
    resultsSheet?.tables.reduce(
      (sum, table) => sum + table.rows.filter((row) => row.noCard).length,
      0,
    ) ?? 0;
  const resultsSessionWords =
    chosenDay?.dayNumber !== 1
      ? "whole round"
      : resultsSheet?.tables.length === 1 && resultsSheet.tables[0]?.session === null
        ? "session not set"
        : resultsSession === "all"
          ? "AM and PM"
          : resultsSession;
  const resultsSummary = resultsLoading
    ? "Reading this day's results…"
    : !chosenDay
      ? "Choose a playing day to print its results."
      : !resultsRound
        ? `${chosenDay.label} · no scoring round is open for this day`
        : `${chosenDay.label} · ${resultsSessionWords} · ${resultsTablesCount} table${
            resultsTablesCount === 1 ? "" : "s"
          } · ${resultsPlayersCount} player${resultsPlayersCount === 1 ? "" : "s"}${
            resultsMissingCards > 0 ? ` · ${resultsMissingCards} without a card` : ""
          }`;

  // The player-facing pairings sheet before the draw is published. It is built from the same board
  // as the start sheet, goes through the same allow-list projection, and is marked as a draft. The
  // public pages still read only the published snapshot, so this cannot leak a draft to players.
  // Once a published list exists it wins, because that is what players can actually see.
  const draftPairings = publishedPairings
    ? null
    : buildDraftPairings({
        tournamentName: tournament.name,
        dateLabel: fmtDateLabel(tournament.dates),
        startFormat: tournament.config.startFormat,
        firstTeeTime: tournament.config.firstTeeTime,
        days:
          allDays && everyDay
            ? everyDay.map((board) => {
                const day = playingDays.find((candidate) => candidate.dayNumber === board.day);
                return {
                  dayNumber: board.day,
                  dayLabel: day?.label ?? `Day ${board.day}`,
                  playDate: day?.playDate ?? null,
                  groups: board.groups,
                };
              })
            : [
                {
                  dayNumber: chosenDay?.dayNumber ?? null,
                  dayLabel: chosenDay?.label ?? null,
                  playDate: chosenDay?.playDate ?? null,
                  groups: printGroups,
                },
              ],
      });
  const pairings = publishedPairings ?? draftPairings;
  const pairingsDraft = !publishedPairings && draftPairings !== null;

  /**
   * Prints every playing day in one run. The desk holds one day at a time, so this reads the whole
   * event's board once and lays out a start sheet per day.
   */
  const loadEveryDay = async (autoPrint = true) => {
    setPreparingAll(true);
    try {
      const client = createSupabaseBrowserClient();
      const [groupsReply, roundsReply] = await Promise.all([
        client
          .from("groups")
          .select("*, group_members(registration_id, position)")
          .eq("tournament_id", tournament.id)
          .order("number"),
        client
          .from("competition_rounds")
          .select("id, day_number")
          .eq("tournament_id", tournament.id),
      ]);
      if (groupsReply.error) throw new Error(groupsReply.error.message);
      if (roundsReply.error) throw new Error(roundsReply.error.message);

      type Row = {
        number: number;
        start_hole: number;
        tee_time: string;
        flight_id: string;
        round_id: string;
        group_members: { registration_id: string; position: number }[] | null;
      };
      const rows = (groupsReply.data ?? []) as unknown as Row[];
      const dayOf = new Map(
        ((roundsReply.data ?? []) as { id: string; day_number: number }[]).map((round) => [
          round.id,
          round.day_number,
        ]),
      );
      const playerOfRegistration = new Map(registrations.map((reg) => [reg.entryId, reg.playerId]));

      const boards = [...new Set(dayOf.values())]
        .sort((a, b) => a - b)
        .map((day) => ({
          day,
          groups: rows
            .filter((row) => dayOf.get(row.round_id) === day)
            .map((row) =>
              toPrintGroup({
                number: row.number,
                startHole: row.start_hole,
                // Postgres returns `time` as HH:MM:SS; the sheets read HH:MM.
                time: row.tee_time.slice(0, 5),
                flightId: row.flight_id,
                playerIds: (row.group_members ?? [])
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((member) => playerOfRegistration.get(member.registration_id))
                  .filter((id): id is string => Boolean(id)),
              }),
            ),
        }));

      setEveryDay(boards);
      if (autoPrint) window.setTimeout(() => window.print(), 400);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not read every day.");
      setAllDays(false);
    } finally {
      setPreparingAll(false);
    }
  };

  // The day scope every sheet and download follows: the one chosen day, or every playing day.
  const everyDayScope = allDays || !chosenDay;
  const scopeBoards: BoardScope[] =
    allDays && everyDay
      ? everyDay.map((board) => {
          const day = playingDays.find((d) => d.dayNumber === board.day);
          return {
            dayNumber: board.day,
            dayLabel: day?.label ?? `Day ${board.day}`,
            playDate: day?.playDate ?? null,
            dateLabel: day ? fmtIso(day.playDate) : fmtDateLabel(tournament.dates),
            groups: board.groups,
          };
        })
      : [
          {
            dayNumber: chosenDay?.dayNumber ?? null,
            dayLabel: chosenDay?.label ?? null,
            playDate: chosenDay?.playDate ?? null,
            dateLabel: chosenDay ? fmtIso(chosenDay.playDate) : fmtDateLabel(tournament.dates),
            groups: printGroups,
          },
        ];
  const inScope = (dayNumber: number) => everyDayScope || chosenDay?.dayNumber === dayNumber;
  const scopedCounts = countBlocks.filter((block) => inScope(block.dayNumber));
  const scopedGroupBlocks = groupBlocks.filter((block) => inScope(block.dayNumber));
  // The published list, cut to the same days. A snapshot with no days is one list for the event.
  const pairingDays = (() => {
    if (!pairings) return [];
    const cut = (dayNumber: number, label: string, playDate: string) => ({
      dayLabel: label,
      pairings: {
        ...pairingsForDay(pairings, dayNumber),
        dateLabel: `${label} · ${fmtIso(playDate)}`,
      },
    });
    if (!everyDayScope && chosenDay) {
      return [cut(chosenDay.dayNumber, chosenDay.label, chosenDay.playDate)];
    }
    return pairings.days && pairings.days.length > 0
      ? pairings.days.map((day) => cut(day.dayNumber, day.label, day.playDate))
      : [{ dayLabel: null, pairings }];
  })();

  const scopeWords =
    tab === "results"
      ? `${KIND_LABEL.results} · ${chosenDay?.label ?? "No day"}${
          chosenDay?.dayNumber === 1 && resultsSession !== "all" ? ` · ${resultsSession}` : ""
        }`
      : `${KIND_LABEL[tab === "howto" ? "start" : tab]} · ${
          everyDayScope ? "All playing days" : (chosenDay?.label ?? "")
        }`;
  const status = published
    ? changedSincePublish
      ? "Published · board has newer changes"
      : "Published"
    : "Draft · not published";

  // Why the download buttons are off, in words. Null means they work.
  const exportBlock: string | null =
    tab === "results"
      ? resultsLoading
        ? "Reading this day's results…"
        : resultsError
          ? resultsError
          : !resultsRound
            ? "No scoring round is open for this day. Open it in Scores first."
            : !resultsSheet || resultsSheet.tables.every((table) => table.rows.length === 0)
              ? "No results to print for this day."
              : null
      : tab === "pairings"
        ? pairings
          ? null
          : draw
            ? "No players are placed on this day's board yet."
            : "Make the draw first."
        : !draw
          ? "Make the draw first."
          : (allDays && !everyDay) || (tab === "counts" && !everyDay)
            ? "Reading every day's board…"
            : null;

  const runExport = async (format: ExportFormat) => {
    if (tab === "howto") return;
    setExporting(format);
    setExportError("");
    try {
      const result = buildPrintBook({
        kind: tab,
        eventName: tournament.name,
        status,
        startFormat: tournament.config.startFormat,
        course: courseDataStatus,
        boards: scopeBoards,
        pairingDays,
        countBlocks: scopedCounts,
        groupBlocks: scopedGroupBlocks,
        groupBy,
        holes,
        resultsSheets: resultsSheet ? [resultsSheet] : [],
      });
      if (!result) {
        setExportError("Nothing to download for this day yet.");
        return;
      }
      let blob: Blob;
      if (format === "xlsx") {
        blob = await (await import("@/lib/export/xlsx-book")).buildBookXlsx(result.book);
      } else if (result.scorecards) {
        blob = await (await import("@/lib/export/pdf")).buildScorecardsPdf(
          { ...result.book, note: courseNote(courseDataStatus) },
          result.scorecards,
        );
      } else {
        blob = await (await import("@/lib/export/pdf")).buildBookPdf(result.book);
      }
      downloadBlob(blob, printFileName(result, format));
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The file could not be made.");
    } finally {
      setExporting(null);
    }
  };

  const onScope = (value: string) => {
    setExportError("");
    if (value === "all") {
      setAllDays(true);
      void loadEveryDay(false);
      return;
    }
    setAllDays(false);
    setDrawDay(value === "" ? null : Number(value));
  };

  // Derived from what is saved and whether an owner or organizer confirmed it against the club
  // scorecard, never typed in: real, confirmed data prints clean; anything else keeps its mark.
  const courseDataStatus = deriveCourseDataStatus({
    confirmed: tournament.courseDataConfirmed,
    tees,
    holes,
  });
  const dateText = chosenDay ? fmtIso(chosenDay.playDate) : fmtDateLabel(tournament.dates);
  const dayPart = chosenDay ? `${chosenDay.label} · ` : "";
  const subtitle = `${tournament.name} · ${dayPart}${dateText} · ${
    shotgun ? "Shotgun start" : "Two-tee start"
  } · first tee ${tournament.config.firstTeeTime}${
    groups[0] ? ` · ${groups.length} groups` : " · no draw yet"
  }`;
  const scorecardSubtitle = `${dayPart}${dateText} · ${
    shotgun ? "Shotgun start" : "Two-tee start"
  } · first tee ${tournament.config.firstTeeTime}`;

  return (
    <div className="grid gap-6">
      <PageHeader
        overline="Print center"
        title="Print sheets"
        crumbs={[{ label: tournament.name, href: "/tournaments" }, { label: "Print center" }]}
        actions={
          <>
            {playingDays.length > 0 && tab !== "results" && (
              <label className="no-print grid w-full min-w-0 gap-1 sm:w-auto">
                <span className="overline !text-[10px]">Day to print</span>
                <select
                  value={allDays ? "all" : (drawDay ?? "")}
                  onChange={(e) => onScope(e.target.value)}
                  // The longest day label is wider than a phone; let it fill the row there and use
                  // its own width on a desktop.
                  className="w-full min-w-0 text-[16px] md:text-sm sm:w-auto"
                  data-help="print-day"
                >
                  {playingDays.map((d, index) => (
                    <option key={d.id} value={d.dayNumber}>
                      {d.label} · {fmtIso(d.playDate)} ·{" "}
                      {daySessionSummary(index, playingDays.length)}
                    </option>
                  ))}
                  {playingDays.length > 1 && <option value="all">All playing days</option>}
                </select>
              </label>
            )}
            {tab !== "results" && (
              <Button
                variant="secondary"
                onClick={() => {
                  setAllDays(true);
                  void loadEveryDay();
                }}
                disabled={preparingAll}
                className="no-print min-h-11 md:min-h-0"
                data-help="print-all"
              >
                <Printer aria-hidden="true" /> {preparingAll ? "Preparing…" : "Print all days"}
              </Button>
            )}
            <Button variant="secondary" asChild className="min-h-11">
              <Link href="/pairings">
                <Smartphone aria-hidden="true" /> Public preview
              </Link>
            </Button>
            <Button
              variant="gold"
              onClick={() => window.print()}
              className="no-print min-h-11 md:min-h-0"
              data-help="print-now"
            >
              <Printer aria-hidden="true" /> Print this sheet
            </Button>
          </>
        }
      >
        Built from the current board. Use the browser's print dialog: the sheets are laid out for A4
        or Letter, with the navigation left off. Printing on the club's own printer has not been
        tested.
      </PageHeader>

      {courseDataStatus !== "official" && (
        <p className="notice warn no-print text-[13px]" role="note">
          <b>
            {courseDataStatus === "missing"
              ? "No tees are saved, so no playing handicap can be worked out."
              : "The course data is not confirmed, so these sheets carry a placeholder mark."}
          </b>{" "}
          Enter the club scorecard and confirm it in{" "}
          <Link href="/setup#course">Settings, Course &amp; tees</Link> before printing for an
          event.
        </p>
      )}

      <div className="no-print flex flex-wrap items-center gap-3" data-help="print-tabs">
        <div className="tabs !w-auto grid-cols-3 sm:grid-cols-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                // Results print one round at a time; the earlier all-days choice is left behind.
                if (t.id === "results") {
                  setAllDays(false);
                  setResultsLoading(true);
                  if (!chosenDay && playingDays[0]) setDrawDay(playingDays[0].dayNumber);
                }
                // The counts sheet reads each player's pairing, so it needs every day's board once.
                if (t.id === "counts" && !everyDay && !preparingAll) void loadEveryDay(false);
              }}
              className="flex min-h-11 items-center gap-2 px-3"
            >
              <t.icon className="size-4" aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
        <span className={cn("pill", published ? "ok" : "info")} data-help="print-version">
          {published
            ? changedSincePublish
              ? "Published, with newer changes on the board"
              : "Matches the published list"
            : "Draft · not published"}
        </span>
      </div>

      {tab !== "howto" && (
        <ExportBar
          scopeLabel={scopeWords}
          busy={exporting}
          disabled={exportBlock !== null}
          disabledReason={exportBlock ?? undefined}
          excelAvailable={tab !== "scorecards"}
          error={exportError}
          onExport={(format) => void runExport(format)}
        />
      )}

      <div className="print-sheet-scope">
        {tab === "counts" ? (
          <DayCounts
            blocks={scopedCounts}
            groupBlocks={scopedGroupBlocks}
            groupBy={groupBy}
            onGroupBy={setGroupBy}
            onExport={() => void runExport("xlsx")}
            eventName={tournament.name}
            loading={preparingAll}
          />
        ) : tab === "howto" ? (
          <section className="grid gap-3">
            <h2 className="text-[20px]">How to use the desk</h2>
            <CheatSheet />
          </section>
        ) : tab === "results" ? (
          <section className="grid gap-4">
            <div className="no-print flex flex-wrap items-end gap-3">
              <label className="grid gap-1">
                <span className="overline !text-[10px]">Day</span>
                <select
                  value={chosenDay?.dayNumber ?? ""}
                  onChange={(e) => {
                    setAllDays(false);
                    setResultsLoading(true);
                    setDrawDay(Number(e.target.value));
                  }}
                  className="w-full min-w-0 text-[16px] md:text-sm sm:w-auto"
                >
                  {playingDays.map((d) => (
                    <option key={d.id} value={d.dayNumber}>
                      {d.label} · {fmtIso(d.playDate)}
                    </option>
                  ))}
                </select>
              </label>
              {chosenDay?.dayNumber === 1 && (
                <label className="grid gap-1">
                  <span className="overline !text-[10px]">Session</span>
                  <select
                    value={resultsSession}
                    onChange={(e) => setResultsSession(e.target.value as SessionKey | "all")}
                    className="w-full min-w-0 text-[16px] md:text-sm sm:w-auto"
                  >
                    <option value="all">AM and PM</option>
                    <option value="AM">AM only</option>
                    <option value="PM">PM only</option>
                  </select>
                </label>
              )}
              <p className="hint" role="status">
                {resultsSummary}
              </p>
            </div>
            {resultsError && (
              <p className="notice warn text-[13px]" role="alert">
                {resultsError}
              </p>
            )}
            {resultsLoading ? (
              <p className="notice" role="status">
                Reading this day&apos;s results…
              </p>
            ) : !resultsRound && !resultsError ? (
              <div className="card grid min-h-[220px] place-items-center text-center">
                <div className="grid justify-items-center gap-2">
                  <Trophy className="size-6 text-ink-muted" aria-hidden="true" />
                  <h2>No scoring round is open</h2>
                  <p className="muted">
                    {chosenDay
                      ? `${chosenDay.label} has no scoring round yet.`
                      : "Choose a playing day first."}{" "}
                    Open the round in Scores, then return here to print its results.
                  </p>
                  <Button variant="primary" asChild className="mt-2 no-print">
                    <Link href="/scores">Open Scores</Link>
                  </Button>
                </div>
              </div>
            ) : resultsSheet ? (
              <ResultsSheetView sheet={resultsSheet} />
            ) : null}
          </section>
        ) : !draw ? (
          <div className="card grid min-h-[220px] place-items-center text-center">
            <div className="grid justify-items-center gap-2">
              <FileText className="size-6 text-ink-muted" aria-hidden="true" />
              <h2>Nothing to print yet</h2>
              <p className="muted">
                Make the draw first; the start sheet, pairings and scorecards all come from it.
              </p>
              <Button variant="primary" asChild className="mt-2 no-print">
                <Link href="/draw">Open the draw</Link>
              </Button>
            </div>
          </div>
        ) : allDays && !everyDay ? (
          <p className="notice" role="status">
            Reading every day's board…
          </p>
        ) : tab === "start" ? (
          allDays && everyDay ? (
            <div className="grid gap-6">
              <p className="hint no-print">
                Every playing day, one sheet each.{" "}
                <button type="button" className="btn small ghost" onClick={() => setAllDays(false)}>
                  Back to this day only
                </button>
              </p>
              {everyDay.map((board) => {
                const label =
                  playingDays.find((d) => d.dayNumber === board.day)?.label ?? `Day ${board.day}`;
                return (
                  <StartSheet
                    key={board.day}
                    title={`Start sheet · ${label}`}
                    eventName={tournament.name}
                    subtitle={`${tournament.name} · ${label} · ${fmtDateLabel(tournament.dates)} · ${
                      shotgun ? "Shotgun start" : "Two-tee start"
                    } · ${board.groups.length} groups`}
                    groups={board.groups}
                    startFormat={tournament.config.startFormat}
                    courseDataStatus={courseDataStatus}
                  />
                );
              })}
            </div>
          ) : (
            <StartSheet
              title="Start sheet"
              eventName={tournament.name}
              subtitle={subtitle}
              groups={printGroups}
              startFormat={tournament.config.startFormat}
              courseDataStatus={courseDataStatus}
            />
          )
        ) : tab === "pairings" ? (
          <section className="grid gap-3">
            <h2 className="text-[20px]">Pairings</h2>
            {pairings ? (
              <>
                {pairingsDraft && (
                  <p className="notice no-print" role="note">
                    <b>Draft · not published.</b> This sheet is built from the current board.
                    Players still see the last published list, or nothing.
                  </p>
                )}
                {pairingDays.map((day) => (
                  <PairingsSheet
                    key={day.dayLabel ?? "event"}
                    pairings={day.pairings}
                    title={day.dayLabel ? `Pairings · ${day.dayLabel}` : "Pairings"}
                    draft={pairingsDraft}
                  />
                ))}
              </>
            ) : (
              <p className="muted">
                {draw
                  ? "No players are placed on this day's board yet."
                  : "Make the draw first; the pairings sheet comes from it."}
              </p>
            )}
          </section>
        ) : allDays && everyDay ? (
          <>
            {everyDay.map((board) => {
              const day = playingDays.find((d) => d.dayNumber === board.day);
              return (
                <Scorecards
                  key={board.day}
                  title={tournament.name}
                  subtitle={`${day?.label ?? `Day ${board.day}`} · ${
                    day ? fmtIso(day.playDate) : fmtDateLabel(tournament.dates)
                  } · ${shotgun ? "Shotgun start" : "Two-tee start"} · first tee ${
                    tournament.config.firstTeeTime
                  }`}
                  hostName={tournament.hostName}
                  logoUrl={tournament.logoUrl}
                  groups={board.groups}
                  holes={holes}
                  startFormat={tournament.config.startFormat}
                  courseDataStatus={courseDataStatus}
                />
              );
            })}
          </>
        ) : (
          <Scorecards
            title={tournament.name}
            subtitle={scorecardSubtitle}
            hostName={tournament.hostName}
            logoUrl={tournament.logoUrl}
            groups={printGroups}
            holes={holes}
            startFormat={tournament.config.startFormat}
            courseDataStatus={courseDataStatus}
          />
        )}
      </div>

      {/* Phone only: the header actions sit at the top of a long sheet, so the two print actions
          stay within reach above the app's bottom tab bar. The header actions remain. */}
      <div className="no-print sticky bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-20 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-surface/95 px-4 py-2 backdrop-blur md:hidden">
        {tab !== "results" && (
          <Button
            variant="secondary"
            size="sm"
            className="min-h-11 flex-1"
            onClick={() => {
              setAllDays(true);
              void loadEveryDay();
            }}
            disabled={preparingAll}
          >
            <Printer aria-hidden="true" /> {preparingAll ? "Preparing…" : "Print all days"}
          </Button>
        )}
        <Button variant="gold" size="sm" className="min-h-11 flex-1" onClick={() => window.print()}>
          <Printer aria-hidden="true" /> Print this sheet
        </Button>
      </div>
    </div>
  );
}
