import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarUrl } from "./ics";

describe("calendar export", () => {
  it("writes one all-day event with an exclusive end date", () => {
    const ics = buildIcs(
      [
        {
          id: "event-1",
          name: "Bamboo Tee, sponsored",
          hostName: "Tesla",
          location: "IGCC",
          dates: ["2026-11-12", "2026-11-13"],
        },
      ],
      new Date("2026-10-24T00:00:00Z"),
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261112");
    expect(ics).toContain("DTEND;VALUE=DATE:20261114");
    expect(ics).toContain("SUMMARY:Bamboo Tee\\, sponsored");
    expect(ics).toContain("DTSTAMP:20261024T000000Z");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("splits a non-contiguous date list into separate calendar events", () => {
    const ics = buildIcs([
      {
        id: "event-1",
        name: "Split Event",
        dates: ["2026-11-12", "2026-11-14"],
      },
    ]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("UID:event-1@teeline.golf");
    expect(ics).toContain("UID:event-1-2@teeline.golf");
    expect(ics).toContain("DTEND;VALUE=DATE:20261113");
    expect(ics).toContain("DTEND;VALUE=DATE:20261115");
  });

  it("creates a Google Calendar template link", () => {
    const link = googleCalendarUrl({
      id: "event-1",
      name: "Bamboo Tee",
      hostName: "Tesla",
      dates: ["2026-11-12"],
    });
    expect(link).toContain("calendar.google.com");
    expect(link).toContain("dates=20261112%2F20261113");
    expect(link).toContain("text=Bamboo+Tee");
  });
});
