import { describe, expect, it } from "vitest";
import {
  advisoryForToday,
  type PublicAdvisory,
  parsePublicAdvisory,
  visibleAdvisory,
} from "./advisory";

const payload = {
  show: true,
  title: "  Important advisory: 24th Bamboo Tee  ",
  lines: ["  The tee-off time is moved earlier to 6:00 AM.  ", "", 42, "Please arrive early."],
  signature: "Organizing Committee, 24th Bamboo Tee Golf Tournament",
  until: "2026-11-15",
};

const advisory: PublicAdvisory = {
  show: true,
  title: "Important advisory: 24th Bamboo Tee",
  lines: ["The tee-off time is moved earlier to 6:00 AM."],
  signature: "Organizing Committee",
  until: "2026-11-15",
};

describe("parsePublicAdvisory", () => {
  it("keeps the allow-listed fields and trims the text", () => {
    expect(parsePublicAdvisory(payload)).toEqual({
      show: true,
      title: "Important advisory: 24th Bamboo Tee",
      lines: ["The tee-off time is moved earlier to 6:00 AM.", "Please arrive early."],
      signature: "Organizing Committee, 24th Bamboo Tee Golf Tournament",
      until: "2026-11-15",
    });
  });

  it("accepts a hidden advisory, so the caller decides with visibleAdvisory", () => {
    expect(parsePublicAdvisory({ ...payload, show: false })?.show).toBe(false);
  });

  it("treats a missing signature as an empty one", () => {
    const { signature: _signature, ...withoutSignature } = payload;
    expect(parsePublicAdvisory(withoutSignature)?.signature).toBe("");
  });

  it("rejects a document it cannot trust", () => {
    expect(parsePublicAdvisory(null)).toBeNull();
    expect(parsePublicAdvisory("show")).toBeNull();
    expect(parsePublicAdvisory([])).toBeNull();
    expect(parsePublicAdvisory({ ...payload, show: "true" })).toBeNull();
    expect(parsePublicAdvisory({ ...payload, title: "   " })).toBeNull();
    expect(parsePublicAdvisory({ ...payload, until: "15 November 2026" })).toBeNull();
    expect(parsePublicAdvisory({ ...payload, until: null })).toBeNull();
  });

  it("drops lines that are not strings instead of failing the whole advisory", () => {
    const parsed = parsePublicAdvisory({
      ...payload,
      lines: [null, { text: "nested" }, "Only this one."],
    });
    expect(parsed?.lines).toEqual(["Only this one."]);
  });
});

describe("visibleAdvisory", () => {
  it("shows on any day before the last day", () => {
    expect(visibleAdvisory(advisory, "2026-11-12")).toEqual(advisory);
  });

  it("shows on the last day itself", () => {
    expect(visibleAdvisory(advisory, "2026-11-15")).toEqual(advisory);
  });

  it("hides the day after the last day", () => {
    expect(visibleAdvisory(advisory, "2026-11-16")).toBeNull();
  });

  it("hides when show is false", () => {
    expect(visibleAdvisory({ ...advisory, show: false }, "2026-11-12")).toBeNull();
  });

  it("hides when there is no advisory or the day is unreadable", () => {
    expect(visibleAdvisory(null, "2026-11-12")).toBeNull();
    expect(visibleAdvisory(undefined, "2026-11-12")).toBeNull();
    expect(visibleAdvisory(advisory, "today")).toBeNull();
  });

  it("hides an advisory whose last day is unreadable", () => {
    expect(visibleAdvisory({ ...advisory, until: "15/11/2026" }, "2026-11-12")).toBeNull();
  });
});

describe("advisoryForToday", () => {
  it("shows through the last Manila day, even when UTC has already turned over", () => {
    // 15 Nov 2026, 23:59 in Asia/Manila (UTC+8).
    expect(advisoryForToday(advisory, new Date("2026-11-15T15:59:00Z"))).toEqual(advisory);
  });

  it("hides once the club's calendar has moved past the last day", () => {
    // 16 Nov 2026, 00:00 in Asia/Manila, still 15 Nov in UTC.
    expect(advisoryForToday(advisory, new Date("2026-11-15T16:00:00Z"))).toBeNull();
  });
});
