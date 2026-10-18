import { describe, expect, it } from "vitest";
import { parseFormConfig, parseSubmissionResult } from "./public-registration";

describe("parseFormConfig", () => {
  it("returns null when the RPC found nothing", () => {
    expect(parseFormConfig({})).toBeNull();
    expect(parseFormConfig(null)).toBeNull();
  });

  it("reads the public form configuration", () => {
    const config = parseFormConfig({
      tournamentId: "t-1",
      name: "Bamboo Tee",
      dates: ["2026-11-12", "2026-11-13"],
      cutOffDate: "2026-11-01",
      isOpen: true,
      shirtSizes: ["M", "L"],
      teeTimes: [
        {
          day: 1,
          label: "Day 1",
          date: "2026-11-12",
          options: ["06:30", "07:30"],
          needsConfirmation: true,
        },
      ],
      fields: [
        {
          id: "cart",
          label: "Cart",
          type: "select",
          options: ["yes", "no"],
          required: false,
          appliesTo: "both",
          help: null,
        },
      ],
      sponsorQuestion: "Sponsored by a member?",
      instructions: "Register at the pro shop",
      payment: {
        method: "Cash",
        bank: "",
        accountName: "",
        accountNumber: "",
        note: "Pay at the desk",
      },
    });

    expect(config).toMatchObject({
      tournamentId: "t-1",
      name: "Bamboo Tee",
      isOpen: true,
      shirtSizes: ["M", "L"],
      sponsorQuestion: "Sponsored by a member?",
      instructions: "Register at the pro shop",
    });
    expect(config?.teeTimes[0]).toMatchObject({ day: 1, needsConfirmation: true });
    expect(config?.payment?.method).toBe("Cash");
  });

  it("gives empty defaults instead of inventing values", () => {
    const config = parseFormConfig({ tournamentId: "t-1" });
    expect(config).toMatchObject({
      name: "Tournament",
      dates: [],
      isOpen: false,
      shirtSizes: [],
      teeTimes: [],
      fields: [],
      payment: null,
      instructions: null,
    });
  });

  it("only accepts the three known field types", () => {
    const config = parseFormConfig({
      tournamentId: "t-1",
      fields: [{ id: "x", label: "X", type: "unsupported" }],
    });
    expect(config?.fields[0]?.type).toBe("text");
  });
});

describe("parseSubmissionResult", () => {
  it("passes an acceptance through", () => {
    expect(parseSubmissionResult({ ok: true, code: "accepted", message: "Thank you." })).toEqual({
      ok: true,
      code: "accepted",
      message: "Thank you.",
    });
  });

  it("keeps the RPC's own reason for refusing", () => {
    expect(
      parseSubmissionResult({
        ok: false,
        code: "ambiguous",
        message: "More than one member matches that name.",
      }).code,
    ).toBe("ambiguous");
  });

  it("falls back to a safe error for an unknown shape", () => {
    const result = parseSubmissionResult({ whatever: true });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("error");
    expect(result.message).toMatch(/try again/i);
  });
});
