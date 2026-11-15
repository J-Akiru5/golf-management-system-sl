"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { NeedsTournament } from "@/components/NeedsTournament";
import { LeaderboardSheet } from "@/components/print/LeaderboardSheet";
import { Button } from "@/components/ui/button";
import { isFinalPlayingDay } from "@/lib/data/dates";
import type { ScoringRoundView } from "@/lib/data/scoring";
import { sessionForTimeIn, sessionsForDay } from "@/lib/data/sessions";
import type { DeskRegistration, RegistrationEntry } from "@/lib/data/types";
import { buildLeaderboardSheet, type LeaderboardPair } from "@/lib/print/leaderboard-sheet";
import { useDesk } from "@/lib/store/desk-store";
import { playingDaysOfEvent } from "@/lib/store/state";

function nowLabel(): string {
  return new Date().toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });
}

function dateLabel(date: string | null | undefined): string | null {
  if (!date) return null;
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

/**
 * The printed scores leaderboard: pairs in leaderboard order, one member row and one guest row per
 * pair, a column for each playing day and the player's course handicap beside the class.
 *
 * It reads the desk's current scoring views for every playing day, so the sheet matches the latest
 * cards the desk has, not a stale public snapshot. The public page is the frozen publication.
 */
export default function PrintLeaderboardPage() {
  const { tournament, entries, regById, players, names, days, scoring } = useDesk();
  const playingDays = useMemo(() => playingDaysOfEvent(days), [days]);
  const [rounds, setRounds] = useState<Record<number, ScoringRoundView | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [asOf, setAsOf] = useState("");

  useEffect(() => {
    setAsOf(nowLabel());
  }, []);

  useEffect(() => {
    if (!tournament) return;
    let active = true;
    const failed: number[] = [];
    setLoading(true);
    setError("");
    Promise.all(
      playingDays.map(async (day) => {
        try {
          return [day.dayNumber, await scoring.loadRound(tournament.id, day.dayNumber)] as const;
        } catch {
          failed.push(day.dayNumber);
          return [day.dayNumber, null] as const;
        }
      }),
    ).then((loaded) => {
      if (!active) return;
      setRounds(Object.fromEntries(loaded));
      setLoading(false);
      if (failed.length > 0) {
        setError(
          `No scoring round could be read for ${failed.map((day) => `Day ${day}`).join(", ")}. Those columns print as a dash.`,
        );
      }
    });
    return () => {
      active = false;
    };
  }, [tournament, playingDays, scoring]);

  const pairs = useMemo<LeaderboardPair[]>(() => {
    const byTeam = new Map<number, { member?: RegistrationEntry; guest?: RegistrationEntry }>();
    for (const entry of entries) {
      if (entry.teamNo === null || entry.teamNo === undefined) continue;
      const slot = byTeam.get(entry.teamNo) ?? {};
      if (entry.role === "guest") {
        if (!slot.guest) slot.guest = entry;
      } else if (!slot.member) {
        slot.member = entry;
      }
      byTeam.set(entry.teamNo, slot);
    }

    const dayRow = (dayNumber: number) => days.find((day) => day.dayNumber === dayNumber) ?? null;
    const sessionFor = (
      entry: RegistrationEntry | undefined,
      dayNumber: number,
    ): "AM" | "PM" | null => {
      if (!entry) return null;
      const stored = entry.daySessions?.[dayNumber];
      if (stored === "AM" || stored === "PM") return stored;
      const teeTime = entry.dayTee?.[dayNumber]?.teeTime;
      if (!teeTime) return null;
      const row = dayRow(dayNumber);
      const sessions = sessionsForDay(
        {
          startTime: row?.startTime ?? tournament?.config.firstTeeTime,
          pmStartTime: row?.pmStartTime,
        },
        {
          eventPmStart: tournament?.config.pmFirstTeeTime,
          finalDay: row ? isFinalPlayingDay(row, days) : false,
        },
      );
      return sessionForTimeIn(sessions, teeTime)?.key ?? null;
    };

    const cellsFor = (entry: RegistrationEntry | undefined) =>
      playingDays.map((day) => {
        const round = rounds[day.dayNumber] ?? null;
        const points =
          (entry
            ? round?.standings.players.find((player) => player.playerId === entry.playerId)
                ?.netPoints
            : null) ?? null;
        return { points, session: sessionFor(entry, day.dayNumber) };
      });

    const playerFor = (entry: RegistrationEntry | undefined, side: "member" | "guest") => {
      const registration: DeskRegistration | undefined = entry
        ? regById.get(entry.playerId)
        : undefined;
      const player = entry ? players.find((candidate) => candidate.id === entry.playerId) : null;
      return {
        playerId: entry?.playerId ?? null,
        name: player?.name ?? "—",
        side,
        courseHandicap: registration?.playingHandicap ?? null,
        cells: cellsFor(entry),
        total: null,
      };
    };

    const result: LeaderboardPair[] = [];
    for (const [pairNumber, slot] of byTeam) {
      const member = playerFor(slot.member, "member");
      const guest = playerFor(slot.guest, "guest");
      const classId =
        (slot.member ? regById.get(slot.member.playerId)?.flightId : null) ??
        (slot.guest ? regById.get(slot.guest.playerId)?.flightId : null) ??
        null;
      result.push({
        pairNumber,
        className: classId ? names.flight(classId) : null,
        member,
        guest,
        teamTotal: null,
      });
    }
    return result;
  }, [entries, regById, players, names, playingDays, rounds, days, tournament]);

  const sheet = useMemo(
    () =>
      buildLeaderboardSheet({
        eventName: tournament?.name ?? "",
        asOf,
        days: playingDays.map((day) => ({
          dayNumber: day.dayNumber,
          label: day.label || `Day ${day.dayNumber}`,
          dateLabel: dateLabel(day.playDate),
        })),
        pairs,
      }),
    [tournament?.name, asOf, playingDays, pairs],
  );

  if (!tournament) return <NeedsTournament what="The scores leaderboard" />;

  function printSheet() {
    setAsOf(nowLabel());
    window.setTimeout(() => window.print(), 100);
  }

  return (
    <div className="grid gap-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" asChild className="min-h-11">
          <Link href="/print">
            <ArrowLeft aria-hidden="true" /> Print center
          </Link>
        </Button>
        <Button variant="gold" onClick={printSheet} disabled={loading} className="min-h-11">
          <Printer aria-hidden="true" /> Print leaderboard
        </Button>
      </div>
      {loading && (
        <p className="hint no-print" role="status">
          Reading the day's scores…
        </p>
      )}
      {error && (
        <p className="notice warn no-print" role="status">
          {error}
        </p>
      )}
      <LeaderboardSheet sheet={sheet} />
    </div>
  );
}
