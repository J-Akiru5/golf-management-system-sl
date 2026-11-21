import { describe, expect, it } from "vitest";
import { directionLabel, formatWhen, outcomeLabel, outcomeTone } from "./format";

describe("the GitHub labels", () => {
  it("formats a timestamp in the club's timezone, and says so when there is none", () => {
    expect(formatWhen(null)).toBe("Not yet");
    expect(formatWhen("")).toBe("Not yet");
    expect(formatWhen("not a date")).toBe("Not yet");
    expect(formatWhen("2026-11-21T01:00:00Z")).toBe("Nov 21, 2026, 9:00 AM");
  });

  it("names each direction and outcome in plain words", () => {
    expect(directionLabel("inbound")).toBe("From GitHub");
    expect(directionLabel("outbound")).toBe("To GitHub");
    expect(outcomeLabel("applied")).toBe("Applied");
    expect(outcomeLabel("skipped")).toBe("Skipped");
    expect(outcomeLabel("conflict")).toBe("Conflict");
    expect(outcomeLabel("error")).toBe("Failed");
  });

  it("gives each outcome a tone", () => {
    expect(outcomeTone("applied")).toBe("success");
    expect(outcomeTone("skipped")).toBe("neutral");
    expect(outcomeTone("conflict")).toBe("warning");
    expect(outcomeTone("error")).toBe("danger");
  });
});
