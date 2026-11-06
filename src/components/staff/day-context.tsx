"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  chooseDay,
  type DayChoiceReason,
  dayNotice,
  isoToday,
  type StaffDay,
  toStaffDays,
} from "@/lib/staff/day";
import { useDesk } from "@/lib/store/desk-store";

interface StaffDayState {
  days: StaffDay[];
  day: StaffDay | null;
  /** What the header should say when the day shown is not today. */
  notice: string | null;
  setDayNumber: (dayNumber: number) => void;
  /** The repeatable position of the day, for the AM/PM session cut. */
  dayIndex: number;
  dayCount: number;
  tournamentId: string | null;
  ready: boolean;
}

const Ctx = createContext<StaffDayState | null>(null);

/**
 * One playing day for the whole staff app. It opens on today when the event is on today, and keeps
 * a chosen day for this visit only: a shared phone must not open tomorrow's list for the next
 * person because the last volunteer tapped it.
 */
export function StaffDayProvider({ children }: { children: ReactNode }) {
  // The desk derives the structured days (including which ones the event actually plays); the
  // tournament row only carries its date list, which is not the same thing.
  const { tournament, status, days: eventDays } = useDesk();
  const days = useMemo(() => toStaffDays(eventDays), [eventDays]);
  const [chosen, setChosen] = useState<number | null>(null);

  const auto = useMemo(() => chooseDay(days, isoToday(new Date())), [days]);
  const day = useMemo(
    () =>
      chosen === null ? auto.day : (days.find((entry) => entry.number === chosen) ?? auto.day),
    [auto.day, chosen, days],
  );
  const reason: DayChoiceReason = chosen === null ? auto.reason : "today";
  const notice = chosen === null ? dayNotice(auto.reason) : null;

  const setDayNumber = useCallback((dayNumber: number) => setChosen(dayNumber), []);

  // A new event starts on its own day, not on the number the last event was on.
  useEffect(() => {
    setChosen(null);
  }, [tournament?.id]);

  const dayIndex = day ? days.findIndex((entry) => entry.number === day.number) : -1;

  const value = useMemo<StaffDayState>(
    () => ({
      days,
      day,
      notice,
      setDayNumber,
      dayIndex: dayIndex < 0 ? 0 : dayIndex,
      dayCount: days.length,
      tournamentId: tournament?.id ?? null,
      ready: status === "demo" || status === "ready",
    }),
    [days, day, notice, setDayNumber, dayIndex, tournament?.id, status],
  );

  // `reason` is computed for the initial pick; it is part of the testable helper's contract and
  // must stay referenced so the dependency list above cannot silently drop the auto choice.
  void reason;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStaffDay(): StaffDayState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useStaffDay must be used inside StaffDayProvider");
  return value;
}
