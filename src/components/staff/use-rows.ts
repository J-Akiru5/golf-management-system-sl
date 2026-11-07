"use client";

import { useEffect, useMemo } from "react";
import {
  buildRows,
  buildSchedule,
  type ScheduleGroup,
  type StaffGroup,
  type StaffPerson,
  type StaffRow,
  staffGroupId,
} from "@/lib/staff/rows";
import { useDesk } from "@/lib/store/desk-store";
import { useStaffDay } from "./day-context";

export interface StaffRows {
  rows: StaffRow[];
  groups: StaffGroup[];
  schedule: ScheduleGroup[];
  people: Map<string, StaffPerson>;
}

/**
 * The day's players and groups, derived once for every staff screen.
 *
 * The desk keeps one board per event at a time, so asking for a day sets the board's day; its
 * groups then belong to the day the header shows. In demo mode that call is harmless.
 */
export function useStaffRows(): StaffRows {
  const { entries, players, playerById, draw, names, drawDay, setDrawDay, registrations } =
    useDesk();
  const { day, dayIndex, dayCount } = useStaffDay();

  useEffect(() => {
    if (!day) return;
    if (drawDay !== day.number) setDrawDay(day.number);
  }, [day, drawDay, setDrawDay]);

  const people = useMemo(
    () =>
      new Map<string, StaffPerson>(
        players.map((player) => [
          player.id,
          {
            playerId: player.id,
            playerName: player.name,
            contactNumber: player.contactNumber,
          },
        ]),
      ),
    [players],
  );

  // The desk derives a registration's status from the player and the entry together. That status
  // is what marks a walk-up as needing review; the entry alone often carries none.
  const statusByPlayer = useMemo(
    () =>
      new Map(registrations.map((registration) => [registration.playerId, registration.status])),
    [registrations],
  );

  const groups = useMemo<StaffGroup[]>(() => {
    if (!day) return [];
    return (draw ?? []).map((group) => ({
      id: staffGroupId(day.number, group.number),
      number: group.number,
      time: group.time,
      startHole: group.startHole,
      flightId: group.flightId,
      players: group.playerIds.map((playerId) => ({
        playerId,
        playerName: playerById.get(playerId)?.name ?? "Unknown player",
      })),
    }));
  }, [day, draw, playerById]);

  const rows = useMemo<StaffRow[]>(() => {
    if (!day) return [];
    return buildRows({
      entries,
      people,
      groups,
      dayNumber: day.number,
      dayIndex,
      dayCount,
      statusByPlayer,
    });
  }, [day, entries, people, groups, dayIndex, dayCount, statusByPlayer]);

  const schedule = useMemo(
    () => buildSchedule(groups, rows, names.flight),
    [groups, rows, names.flight],
  );

  return { rows, groups, schedule, people };
}
