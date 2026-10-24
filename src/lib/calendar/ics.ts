export interface IcsEvent {
  id: string;
  name: string;
  hostName?: string | null;
  location?: string | null;
  dates: string[];
  description?: string | null;
}

const escape = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

const compact = (date: string): string => date.replaceAll("-", "");

function addDay(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function dateRuns(dates: readonly string[]): { start: string; end: string }[] {
  const sorted = [...new Set(dates.filter(Boolean))].sort();
  const runs: { start: string; end: string }[] = [];
  for (const date of sorted) {
    const current = runs.at(-1);
    if (current && addDay(current.end) === date) current.end = date;
    else runs.push({ start: date, end: date });
  }
  return runs;
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  parts.push(rest);
  return parts.join("\r\n");
}

function stamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function buildIcs(events: readonly IcsEvent[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TeeLine Golf//Event Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:TeeLine Golf events",
  ];
  for (const event of events) {
    const runs = dateRuns(event.dates);
    const description = [event.hostName ? `Host: ${event.hostName}` : "", event.description ?? ""]
      .filter(Boolean)
      .join("\n");
    for (const [index, run] of runs.entries()) {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${escape(event.id)}${index === 0 ? "" : `-${index + 1}`}@teeline.golf`);
      lines.push(`DTSTAMP:${stamp(now)}`);
      lines.push(`DTSTART;VALUE=DATE:${compact(run.start)}`);
      lines.push(`DTEND;VALUE=DATE:${compact(addDay(run.end))}`);
      lines.push(`SUMMARY:${escape(event.name)}`);
      if (event.location) lines.push(`LOCATION:${escape(event.location)}`);
      if (description) lines.push(`DESCRIPTION:${escape(description)}`);
      lines.push("STATUS:CONFIRMED");
      lines.push("END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export function googleCalendarUrl(event: IcsEvent): string | null {
  const run = dateRuns(event.dates)[0];
  if (!run) return null;
  const start = compact(run.start);
  const end = compact(addDay(run.end));
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.name,
    dates: `${start}/${end}`,
    details: [event.hostName ? `Host: ${event.hostName}` : "", event.description ?? ""]
      .filter(Boolean)
      .join("\n"),
  });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
