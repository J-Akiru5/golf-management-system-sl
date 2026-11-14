import { describe, expect, it } from "vitest";
import {
  DEFAULT_PUBLISH_MODE,
  formatPublishTime,
  PUBLISH_MODES,
  type PublishDecisionInput,
  publishDecision,
  publishModeFromStored,
  publishModeKey,
  publishModeLabel,
} from "./publish-mode";

function input(overrides: Partial<PublishDecisionInput> = {}): PublishDecisionInput {
  return {
    mode: "every",
    checked: false,
    provisionalPublication: true,
    roundStatus: "scoring",
    ...overrides,
  };
}

describe("the publish mode", () => {
  it("offers exactly the three modes the owner asked for", () => {
    expect(PUBLISH_MODES.map((option) => option.value)).toEqual(["every", "checked", "manual"]);
    expect(PUBLISH_MODES.map((option) => option.label)).toEqual([
      "Publish every saved card",
      "Publish checked cards only",
      "Manual",
    ]);
    expect(DEFAULT_PUBLISH_MODE).toBe("every");
  });

  it("labels a mode and echoes an unknown one rather than blanking it", () => {
    expect(publishModeLabel("every")).toBe("Publish every saved card");
    expect(publishModeLabel("manual")).toBe("Manual");
  });

  it("reads a stored mode, and keeps the meaning of the old on/off checkbox", () => {
    expect(publishModeFromStored("every")).toBe("every");
    expect(publishModeFromStored("checked")).toBe("checked");
    expect(publishModeFromStored("manual")).toBe("manual");
    // The checkbox stored "1" for checked cards only and "0" for off.
    expect(publishModeFromStored("1")).toBe("checked");
    expect(publishModeFromStored("0")).toBe("manual");
  });

  it("falls back to publishing every saved card when nothing usable is stored", () => {
    for (const stored of [null, undefined, "", "true", "EVERY"]) {
      expect(publishModeFromStored(stored)).toBe(DEFAULT_PUBLISH_MODE);
    }
  });

  it("is remembered once per event and day, so the day's control is the one the desk sets", () => {
    expect(publishModeKey("t1", 4)).toBe("teeline-auto-publish:t1:4");
    expect(publishModeKey("t1", 4)).not.toBe(publishModeKey("t1", 3));
    expect(publishModeKey("t1", 4)).not.toBe(publishModeKey("t2", 4));
    // The key the old publish-on-verify checkbox used, so a stored "0" or "1" still means something.
    expect(publishModeKey("t1", null)).toBe("teeline-auto-publish:t1:all");
  });
});

describe("the publish decision", () => {
  it("publishes a saved card, checked or not, in the every-saved-card mode", () => {
    expect(publishDecision(input({ mode: "every", checked: false }))).toEqual({ publish: true });
    expect(publishDecision(input({ mode: "every", checked: true }))).toEqual({ publish: true });
  });

  it("publishes only a checked card in the checked-cards mode", () => {
    expect(publishDecision(input({ mode: "checked", checked: true }))).toEqual({ publish: true });
    expect(publishDecision(input({ mode: "checked", checked: false }))).toEqual({
      publish: false,
      reason: "awaiting_check",
    });
  });

  it("publishes nothing by itself in the manual mode", () => {
    expect(publishDecision(input({ mode: "manual", checked: true }))).toEqual({
      publish: false,
      reason: "manual",
    });
    expect(publishDecision(input({ mode: "manual", checked: false }))).toEqual({
      publish: false,
      reason: "manual",
    });
  });

  it("never queues a publish the round would refuse", () => {
    for (const mode of ["every", "checked", "manual"] as const) {
      expect(publishDecision(input({ mode, checked: true, roundStatus: "final" }))).toMatchObject({
        publish: false,
        reason: "round_final",
      });
      expect(publishDecision(input({ mode, checked: true, roundStatus: "draft" }))).toMatchObject({
        publish: false,
        reason: "round_not_open",
      });
      expect(
        publishDecision(input({ mode, checked: true, provisionalPublication: false })),
      ).toMatchObject({ publish: false, reason: "round_not_publishable" });
    }
  });

  it("publishes again from a round already published provisionally", () => {
    expect(publishDecision(input({ roundStatus: "provisional" }))).toEqual({ publish: true });
  });
});

describe("the last publish time", () => {
  it("is formatted from the stored time, not from the browser clock", () => {
    expect(formatPublishTime("2026-11-15T07:42:11.000Z")).toBe("2026-11-15 07:42 UTC");
    expect(formatPublishTime("2026-11-15T23:05:00.000Z")).toBe("2026-11-15 23:05 UTC");
  });

  it("is null when there is no time or it cannot be read", () => {
    expect(formatPublishTime(null)).toBeNull();
    expect(formatPublishTime("")).toBeNull();
    expect(formatPublishTime("not a date")).toBeNull();
  });
});
