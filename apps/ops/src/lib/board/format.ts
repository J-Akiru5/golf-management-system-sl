import { PRICING_MODELS } from "@/lib/db/constants";
import type { PricingModel } from "@/lib/db/types";

/**
 * Display helpers for the board. Everything is a pure function and dates are built from the parsed
 * UTC parts, so the server render and the browser render produce the same text on every machine.
 */

const LOCALE = "en-PH";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Parse a `date` column ("YYYY-MM-DD") as UTC midnight. Null for a missing or invalid value. */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function shortDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}

export function formatDate(value: string | null | undefined): string | null {
  const date = parseIsoDate(value);
  return date === null ? null : shortDate(date);
}

/** A start and end date in plain words. Missing dates say so rather than showing a guess. */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (startDate === null && endDate === null) return "No date";
  if (startDate !== null && endDate === null) return shortDate(startDate);
  if (startDate === null && endDate !== null) return `Until ${shortDate(endDate)}`;
  if (startDate === null || endDate === null) return "No date";
  if (start === end) return shortDate(startDate);

  const sameMonth =
    startDate.getUTCFullYear() === endDate.getUTCFullYear() &&
    startDate.getUTCMonth() === endDate.getUTCMonth();
  if (sameMonth) {
    return `${startDate.getUTCDate()} to ${shortDate(endDate)}`;
  }
  return `${shortDate(startDate)} to ${shortDate(endDate)}`;
}

/** A month key ("YYYY-MM") as a heading, for the month filter. */
export function formatMonth(month: string): string {
  const date = parseIsoDate(`${month}-01`);
  if (date === null) return month;
  return `${MONTHS_LONG[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}

/**
 * Money with the row's own currency. An invalid currency code falls back to the number and the
 * code instead of throwing or guessing a symbol.
 */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(LOCALE, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** "96 players", "1 player", or null when the count is missing. */
export function formatPlayers(count: number | null | undefined): string | null {
  if (typeof count !== "number" || !Number.isFinite(count)) return null;
  return `${count} ${count === 1 ? "player" : "players"}`;
}

export function pricingLabel(model: PricingModel | null | undefined): string | null {
  if (model === null || model === undefined) return null;
  return PRICING_MODELS.find((entry) => entry.id === model)?.label ?? null;
}
