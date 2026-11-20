import { describe, expect, it } from "vitest";
import {
  type CardFormValues,
  isPipelineStage,
  isPricingModel,
  parseCardForm,
  parseQuickCreate,
} from "./validation";

function form(overrides: Partial<CardFormValues> = {}): CardFormValues {
  return {
    title: "24th Bamboo Tee",
    clubName: "Iloilo Golf and Country Club",
    stage: "prep",
    ownerId: "user-1",
    startDate: "2026-12-12",
    endDate: "2026-12-13",
    expectedPlayers: "144",
    pricingModel: "per_player",
    quotedAmount: "1250000",
    currency: "PHP",
    notes: "Field sheet is the authority.",
    tournamentId: "tournament-1",
    ...overrides,
  };
}

describe("guards", () => {
  it("recognises the seven stages and three pricing models", () => {
    expect(isPipelineStage("invoiced_closed")).toBe(true);
    expect(isPipelineStage("archived")).toBe(false);
    expect(isPricingModel("promo_discount")).toBe(true);
    expect(isPricingModel("hourly")).toBe(false);
  });
});

describe("parseCardForm", () => {
  it("returns a database-shaped patch", () => {
    const result = parseCardForm(form());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch).toEqual({
      title: "24th Bamboo Tee",
      club_name: "Iloilo Golf and Country Club",
      stage: "prep",
      owner_id: "user-1",
      start_date: "2026-12-12",
      end_date: "2026-12-13",
      expected_players: 144,
      pricing_model: "per_player",
      quoted_amount: 1250000,
      currency: "PHP",
      notes: "Field sheet is the authority.",
      tournament_id: "tournament-1",
    });
  });

  it("turns blank optional fields into null", () => {
    const result = parseCardForm(
      form({
        ownerId: "",
        startDate: "",
        endDate: "",
        expectedPlayers: "",
        pricingModel: "",
        quotedAmount: "",
        notes: "",
        tournamentId: "",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.owner_id).toBeNull();
    expect(result.patch.start_date).toBeNull();
    expect(result.patch.end_date).toBeNull();
    expect(result.patch.expected_players).toBeNull();
    expect(result.patch.pricing_model).toBeNull();
    expect(result.patch.quoted_amount).toBeNull();
    expect(result.patch.notes).toBeNull();
    expect(result.patch.tournament_id).toBeNull();
  });

  it("accepts an amount with commas and two decimals", () => {
    const result = parseCardForm(form({ quotedAmount: " 1,250,000.50 " }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.quoted_amount).toBe(1250000.5);
  });

  it("rejects an empty title and club", () => {
    expect(parseCardForm(form({ title: "  " }))).toEqual({ ok: false, message: "Enter a title." });
    expect(parseCardForm(form({ clubName: "" }))).toEqual({
      ok: false,
      message: "Enter the club.",
    });
  });

  it("rejects an unknown stage or pricing model", () => {
    expect(parseCardForm(form({ stage: "archived" }))).toEqual({
      ok: false,
      message: "Choose a stage.",
    });
    expect(parseCardForm(form({ pricingModel: "hourly" }))).toEqual({
      ok: false,
      message: "Choose a pricing model.",
    });
  });

  it("rejects an end date before the start date", () => {
    const result = parseCardForm(form({ startDate: "2026-12-13", endDate: "2026-12-12" }));
    expect(result.ok).toBe(false);
  });

  it("rejects an impossible date instead of storing it", () => {
    expect(parseCardForm(form({ startDate: "2026-02-30" })).ok).toBe(false);
  });

  it("rejects too many players and a malformed amount", () => {
    expect(parseCardForm(form({ expectedPlayers: "5001" })).ok).toBe(false);
    expect(parseCardForm(form({ expectedPlayers: "4.5" })).ok).toBe(false);
    expect(parseCardForm(form({ quotedAmount: "12.345" })).ok).toBe(false);
    expect(parseCardForm(form({ quotedAmount: "-5" })).ok).toBe(false);
  });

  it("uppercases a currency typed in lower case", () => {
    const result = parseCardForm(form({ currency: "php" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.currency).toBe("PHP");
  });

  it("rejects a currency that is not three letters", () => {
    expect(parseCardForm(form({ currency: "PESO" })).ok).toBe(false);
  });

  it("keeps a long note up to the database limit and rejects beyond it", () => {
    expect(parseCardForm(form({ notes: "x".repeat(20000) })).ok).toBe(true);
    expect(parseCardForm(form({ notes: "x".repeat(20001) })).ok).toBe(false);
  });
});

describe("parseQuickCreate", () => {
  it("trims the two fields", () => {
    expect(parseQuickCreate({ title: "  Cebu inquiry ", clubName: " Cebu CC " })).toEqual({
      ok: true,
      title: "Cebu inquiry",
      clubName: "Cebu CC",
    });
  });

  it("rejects an empty field", () => {
    expect(parseQuickCreate({ title: "", clubName: "Club" }).ok).toBe(false);
    expect(parseQuickCreate({ title: "Title", clubName: " " }).ok).toBe(false);
  });
});
