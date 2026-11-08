import { describe, expect, it } from "vitest";
import {
  cutOffIsUrgent,
  cutOffLabel,
  dateRange,
  dayCount,
  daysBetween,
  enteredLabel,
  formatLabel,
  nextIndex,
  timeLabel,
  VENUE_LABEL,
} from "./highlights";

// These run on the server and again during hydration, so nothing here may read the clock or the
// browser's locale. Every expectation below is a fixed string.

describe("dateRange", () => {
  it("collapses a run of days inside one month", () => {
    expect(dateRange(["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"])).toBe(
      "Nov 12–15, 2026",
    );
  });

  it("names both months when the run crosses one", () => {
    expect(dateRange(["2026-11-30", "2026-12-01", "2026-12-02"])).toBe("Nov 30 – Dec 2, 2026");
  });

  it("names both years when the run crosses one", () => {
    expect(dateRange(["2026-12-30", "2027-01-02"])).toBe("Dec 30, 2026 – Jan 2, 2027");
  });

  it("does not invent a range for a single day", () => {
    expect(dateRange(["2026-10-24"])).toBe("Oct 24, 2026");
  });

  it("collapses a run that repeats the same day", () => {
    expect(dateRange(["2026-10-24", "2026-10-24"])).toBe("Oct 24, 2026");
  });

  it("says so rather than guessing when there is nothing", () => {
    expect(dateRange([])).toBe("Dates to be confirmed");
    expect(dateRange(["not-a-date"])).toBe("Dates to be confirmed");
  });

  it("uses the first and last day, not the order they arrived in", () => {
    // The payload is ordered, but a reader should not have to know that.
    expect(dateRange(["2026-11-12", "2026-11-15"])).toBe("Nov 12–15, 2026");
  });
});

describe("dayCount", () => {
  it("counts the days", () => {
    expect(dayCount(["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"])).toBe("4 days");
  });

  it("stays singular for one", () => {
    expect(dayCount(["2026-10-24"])).toBe("1 day");
  });
});

describe("timeLabel", () => {
  it("turns a 24-hour time into the form the club reads", () => {
    expect(timeLabel("06:30")).toBe("6:30 AM");
    expect(timeLabel("12:30")).toBe("12:30 PM");
    expect(timeLabel("00:15")).toBe("12:15 AM");
    expect(timeLabel("13:05")).toBe("1:05 PM");
  });

  it("accepts a time with seconds, which is what the database sends", () => {
    expect(timeLabel("06:30:00")).toBe("6:30 AM");
  });

  it("leaves something it cannot read alone rather than blanking it", () => {
    expect(timeLabel("morning")).toBe("morning");
  });
});

describe("VENUE_LABEL", () => {
  it("names the club where the event is played, with no time in it", () => {
    expect(VENUE_LABEL).toBe("Iloilo Golf and Country Club");
    expect(VENUE_LABEL).not.toMatch(/\d/);
  });
});

describe("formatLabel", () => {
  it("uses the desk's own words for the start format", () => {
    expect(formatLabel("shotgun", "06:30")).toBe("Shotgun · 6:30 AM");
    expect(formatLabel("two_tee", "07:00")).toBe("Two-tee · 7:00 AM");
  });
});

describe("daysBetween", () => {
  it("counts forward and backward", () => {
    expect(daysBetween("2026-10-19", "2026-11-01")).toBe(13);
    expect(daysBetween("2026-11-01", "2026-10-19")).toBe(-13);
  });

  it("is zero on the day itself", () => {
    expect(daysBetween("2026-11-01", "2026-11-01")).toBe(0);
  });

  it("crosses a month and a year boundary without a timezone surprise", () => {
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    // A DST shift would show up as 0 or 2 here if this used local time.
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });
});

describe("cutOffLabel", () => {
  it("reads the last day as today, not as zero", () => {
    expect(cutOffLabel(0)).toBe("Closes today");
  });

  it("counts down", () => {
    expect(cutOffLabel(1)).toBe("1 day to enter");
    expect(cutOffLabel(13)).toBe("13 days to enter");
  });

  it("says closed once it has passed", () => {
    expect(cutOffLabel(-1)).toBe("Entry closed");
  });
});

describe("cutOffIsUrgent", () => {
  it("is urgent in the last three days", () => {
    expect(cutOffIsUrgent(3)).toBe(true);
    expect(cutOffIsUrgent(0)).toBe(true);
  });

  it("is not urgent earlier, and never once closed", () => {
    expect(cutOffIsUrgent(4)).toBe(false);
    expect(cutOffIsUrgent(-1)).toBe(false);
  });
});

describe("enteredLabel", () => {
  it("says nothing rather than zero", () => {
    expect(enteredLabel(0)).toBe("No entries yet");
  });

  it("counts", () => {
    expect(enteredLabel(1)).toBe("1 entered");
    expect(enteredLabel(87)).toBe("87 entered");
  });
});

describe("nextIndex", () => {
  it("wraps forward and backward", () => {
    expect(nextIndex(0, 3, 1)).toBe(1);
    expect(nextIndex(2, 3, 1)).toBe(0);
    expect(nextIndex(0, 3, -1)).toBe(2);
  });

  it("never invents an index for an empty carousel", () => {
    expect(nextIndex(0, 0, 1)).toBe(0);
    expect(nextIndex(4, 0, -1)).toBe(0);
  });

  it("stays inside the range however far it is stepped", () => {
    expect(nextIndex(0, 3, 7)).toBe(1);
    expect(nextIndex(0, 3, -7)).toBe(2);
  });
});
