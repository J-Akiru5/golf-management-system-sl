"use client";

import {
  CircleHelp,
  Download,
  FileText,
  Flag,
  Printer,
  Smartphone,
  TableProperties,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CheatSheet } from "@/components/help";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader } from "@/components/PageHeader";
import { type CountsGrouping, DayCounts } from "@/components/print/DayCounts";
import { PairingsSheet } from "@/components/print/PairingsSheet";
import { Scorecards } from "@/components/print/Scorecards";
import { StartSheet } from "@/components/print/StartSheet";
import type { PrintGroup } from "@/components/print/types";
import { Button } from "@/components/ui/button";
import { courseDataStatus as deriveCourseDataStatus } from "@/lib/data/course-data";
import { playingDaysOf } from "@/lib/data/dates";
import { fmtDateLabel, fmtIso } from "@/lib/data/labels";
import { toPublicPairings } from "@/lib/data/public";
import { daySessionSummary } from "@/lib/data/sessions";
import { buildXlsx, type Cell } from "@/lib/export/xlsx";
import { photoOf } from "@/lib/format";
import { buildDayCountBlocks, buildGroupBlocks } from "@/lib/print/day-counts";
import { UNCLASSIFIED_LABEL } from "@/lib/routing";
import { useDesk } from "@/lib/store/desk-store";
import { isUnclassifiedGroup } from "@/lib/store/state";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/ui/cn";

type Tab = "start" | "counts" | "pairings" | "scorecards" | "howto";

const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "start", label: "Start sheet", icon: TableProperties },
  { id: "counts", label: "Counts", icon: Users },
  { id: "pairings", label: "Pairings", icon: Flag },
  { id: "scorecards", label: "Scorecards", icon: FileText },
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
    names,
    tees,
    holes,
    published,
    changedSincePublish,
    days,
    drawDay,
    setDrawDay,
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
  // The organisers read the same players two ways: by AM/PM session, or by the draw's groups.
  const [groupBy, setGroupBy] = useState<CountsGrouping>("session");
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

  const pairings = useMemo(() => {
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
    } finally {
      setPreparingAll(false);
    }
  };

  /**
   * The same numbers as a workbook: a summary, every player by session, and every group with its
   * players. Built in the browser, so nothing about the event leaves the desk.
   */
  const exportCounts = () => {
    const summary: Cell[][] = [
      ["Day", "Date", "AM", "PM", "Not set", "Players"],
      ...countBlocks.map((block) => [
        block.label,
        block.playDate ?? "",
        block.tally.am,
        block.tally.pm,
        block.tally.unset,
        block.tally.total,
      ]),
    ];
    const bySession: Cell[][] = [
      ["Day", "Date", "AM/PM", "Tee off", "Start hole", "Player"],
      ...countBlocks.flatMap((block) =>
        block.rows.map((row) => [
          block.label,
          block.playDate ?? "",
          row.session ?? "Not set",
          row.teeTime ?? "",
          row.startHole ?? "",
          row.name,
        ]),
      ),
    ];
    const byGroup: Cell[][] = [
      ["Day", "Date", "Group", "Tee off", "Start hole", "AM/PM", "Flight", "Players"],
      ...groupBlocks.flatMap((block) =>
        block.groups.map((group) => [
          block.label,
          block.playDate ?? "",
          group.number,
          group.time ?? "",
          group.startHole ?? "",
          group.session ?? "Not set",
          group.flight,
          group.players.map((player) => player.name).join(", "),
        ]),
      ),
    ];
    const bytes = buildXlsx([
      { name: "Summary", rows: summary },
      { name: "By session", rows: bySession },
      { name: "By group", rows: byGroup },
    ]);
    const blob = new Blob([bytes.buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `players-by-day-${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Derived from what is saved and whether an owner or organizer confirmed it against the club
  // scorecard, never typed in: real, confirmed data prints clean; anything else keeps its mark.
  const courseDataStatus = deriveCourseDataStatus({
    confirmed: tournament.courseDataConfirmed,
    tees,
    holes,
  });
  const dayPart = chosenDay ? `${chosenDay.label} · ` : "";
  const subtitle = `${tournament.name} · ${dayPart}${fmtDateLabel(tournament.dates)} · ${
    shotgun ? "Shotgun start" : "Two-tee start"
  } · first tee ${tournament.config.firstTeeTime}${
    groups[0] ? ` · ${groups.length} groups` : " · no draw yet"
  }`;
  const scorecardSubtitle = `${dayPart}${fmtDateLabel(tournament.dates)} · ${
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
            {playingDays.length > 0 && (
              <label className="no-print grid w-full min-w-0 gap-1 sm:w-auto">
                <span className="overline !text-[10px]">Day to print</span>
                <select
                  value={drawDay ?? ""}
                  onChange={(e) =>
                    setDrawDay(e.target.value === "" ? null : Number(e.target.value))
                  }
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
                </select>
              </label>
            )}
            <Button
              variant="secondary"
              onClick={() => void loadEveryDay()}
              disabled={preparingAll}
              className="no-print min-h-11 md:min-h-0"
              data-help="print-all"
            >
              <Printer aria-hidden="true" /> {preparingAll ? "Preparing…" : "Print all days"}
            </Button>
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
        <div className="tabs !w-auto grid-cols-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                // The counts sheet reads each player's pairing, so it needs every day's board once.
                if (t.id === "counts" && !everyDay && !preparingAll) void loadEveryDay(false);
              }}
              className="flex min-h-11 items-center gap-2 px-4"
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

      <div className="print-sheet-scope">
        {tab === "counts" ? (
          <DayCounts
            blocks={countBlocks}
            groupBlocks={groupBlocks}
            groupBy={groupBy}
            onGroupBy={setGroupBy}
            onExport={exportCounts}
            eventName={tournament.name}
            loading={preparingAll}
          />
        ) : tab === "howto" ? (
          <section className="grid gap-3">
            <h2 className="text-[20px]">How to use the desk</h2>
            <CheatSheet />
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
        ) : tab === "start" ? (
          everyDay ? (
            <div className="grid gap-6">
              <p className="hint no-print">
                Every playing day, one sheet each.{" "}
                <button type="button" className="btn small ghost" onClick={() => setEveryDay(null)}>
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
              <PairingsSheet pairings={pairings} />
            ) : (
              <p className="muted">
                The player view reads the published list. Publish the draw to print the same list
                players see.
              </p>
            )}
          </section>
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
        <Button
          variant="secondary"
          size="sm"
          className="min-h-11 flex-1"
          onClick={() => void loadEveryDay()}
          disabled={preparingAll}
        >
          <Printer aria-hidden="true" /> {preparingAll ? "Preparing…" : "Print all days"}
        </Button>
        <Button
          variant="gold"
          size="sm"
          className="min-h-11 flex-1"
          onClick={() => window.print()}
        >
          <Printer aria-hidden="true" /> Print this sheet
        </Button>
      </div>
    </div>
  );
}
