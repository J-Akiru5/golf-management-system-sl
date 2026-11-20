import { PIPELINE_STAGES, PRICING_MODELS } from "@/lib/db/constants";
import type { PipelineStage, PricingModel } from "@/lib/db/types";
import { parseIsoDate } from "./format";
import type { CardPatch } from "./repo";

/**
 * Validation for the card form and the quick-create form.
 *
 * The database is the real gate, with checks and row level security. This module exists so a
 * person gets a plain message before a round trip, and so a server action never trusts what the
 * browser sent. Rules mirror migration 20261120000300 exactly.
 */

const MAX_TITLE = 160;
const MAX_CLUB = 160;
const MAX_NOTES = 20000;
const MAX_PLAYERS = 5000;
const MAX_AMOUNT = 9999999999.99;

const STAGE_IDS = PIPELINE_STAGES.map((stage) => stage.id);
const PRICING_IDS = PRICING_MODELS.map((model) => model.id);

export function isPipelineStage(value: string): value is PipelineStage {
  return (STAGE_IDS as readonly string[]).includes(value);
}

export function isPricingModel(value: string): value is PricingModel {
  return (PRICING_IDS as readonly string[]).includes(value);
}

export type CardFormValues = {
  title: string;
  clubName: string;
  stage: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  expectedPlayers: string;
  pricingModel: string;
  quotedAmount: string;
  currency: string;
  notes: string;
  tournamentId: string;
};

export type CardFormResult = { ok: true; patch: CardPatch } | { ok: false; message: string };

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function error(message: string): CardFormResult {
  return { ok: false, message };
}

export function parseCardForm(values: CardFormValues): CardFormResult {
  const title = values.title.trim();
  if (title === "") return error("Enter a title.");
  if (title.length > MAX_TITLE) return error(`Keep the title under ${MAX_TITLE} characters.`);

  const clubName = values.clubName.trim();
  if (clubName === "") return error("Enter the club.");
  if (clubName.length > MAX_CLUB) return error(`Keep the club under ${MAX_CLUB} characters.`);

  if (!isPipelineStage(values.stage)) return error("Choose a stage.");

  const startDate = blankToNull(values.startDate);
  const endDate = blankToNull(values.endDate);
  if (startDate !== null && parseIsoDate(startDate) === null)
    return error("Enter a valid start date.");
  if (endDate !== null && parseIsoDate(endDate) === null) return error("Enter a valid end date.");
  if (startDate !== null && endDate !== null && endDate < startDate) {
    return error("The end date cannot be before the start date.");
  }

  let expectedPlayers: number | null = null;
  const playersText = values.expectedPlayers.trim();
  if (playersText !== "") {
    if (!/^\d+$/.test(playersText)) return error("Enter the expected players as a whole number.");
    expectedPlayers = Number(playersText);
    if (expectedPlayers > MAX_PLAYERS)
      return error(`Expected players must be ${MAX_PLAYERS} or fewer.`);
  }

  let pricingModel: PricingModel | null = null;
  const pricingText = values.pricingModel.trim();
  if (pricingText !== "") {
    if (!isPricingModel(pricingText)) return error("Choose a pricing model.");
    pricingModel = pricingText;
  }

  let quotedAmount: number | null = null;
  const amountText = values.quotedAmount.replace(/[,\s]/g, "");
  if (amountText !== "") {
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(amountText)) {
      return error("Enter an amount like 1250000 or 1250000.50.");
    }
    quotedAmount = Number(amountText);
    if (quotedAmount > MAX_AMOUNT) return error("That amount is larger than the field allows.");
  }

  const currency = values.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return error("Enter the currency as three letters, like PHP.");

  const notes = blankToNull(values.notes);
  if (notes !== null && notes.length > MAX_NOTES) {
    return error(`Keep the notes under ${MAX_NOTES} characters.`);
  }

  return {
    ok: true,
    patch: {
      title,
      club_name: clubName,
      stage: values.stage,
      owner_id: blankToNull(values.ownerId),
      start_date: startDate,
      end_date: endDate,
      expected_players: expectedPlayers,
      pricing_model: pricingModel,
      quoted_amount: quotedAmount,
      currency,
      notes,
      tournament_id: blankToNull(values.tournamentId),
    },
  };
}

export type QuickCreateValues = { title: string; clubName: string };
export type QuickCreateResult =
  | { ok: true; title: string; clubName: string }
  | { ok: false; message: string };

export function parseQuickCreate(values: QuickCreateValues): QuickCreateResult {
  const title = values.title.trim();
  if (title === "") return { ok: false, message: "Enter a title." };
  if (title.length > MAX_TITLE) {
    return { ok: false, message: `Keep the title under ${MAX_TITLE} characters.` };
  }
  const clubName = values.clubName.trim();
  if (clubName === "") return { ok: false, message: "Enter the club." };
  if (clubName.length > MAX_CLUB) {
    return { ok: false, message: `Keep the club under ${MAX_CLUB} characters.` };
  }
  return { ok: true, title, clubName };
}
