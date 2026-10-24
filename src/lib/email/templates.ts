import type { Tournament } from "@/lib/data/types";

export type EmailKind = "confirmation" | "reminder" | "custom";

export interface EmailDraft {
  subject: string;
  body: string;
}

const eventDate = (tournament: Tournament): string => {
  const dates = tournament.dates.filter(Boolean);
  if (dates.length === 0) return "the event date";
  if (dates.length === 1) return dates[0] as string;
  return `${dates[0]} to ${dates.at(-1)}`;
};

const hostLine = (tournament: Tournament): string =>
  tournament.hostName?.trim() ? `Host: ${tournament.hostName.trim()}\n` : "";

export function confirmationEmail(
  tournament: Tournament,
  playerName: string,
  siteUrl: string,
): EmailDraft {
  return {
    subject: `Registration confirmed: ${tournament.name}`,
    body: `Hello ${playerName},

Your registration for ${tournament.name} is recorded.

Date: ${eventDate(tournament)}
${hostLine(tournament)}${siteUrl ? `Event page: ${siteUrl}\n` : ""}
If any of your details are wrong, contact the club office.

TeeLine Golf`,
  };
}

export function reminderEmail(
  tournament: Tournament,
  playerName: string,
  siteUrl: string,
): EmailDraft {
  return {
    subject: `Reminder: ${tournament.name}`,
    body: `Hello ${playerName},

This is a reminder that ${tournament.name} is coming up.

Date: ${eventDate(tournament)}
${hostLine(tournament)}Cut-off: ${tournament.cutOffDate}
${siteUrl ? `Event page: ${siteUrl}\n` : ""}Please contact the club office if you need to change your entry.

TeeLine Golf`,
  };
}
