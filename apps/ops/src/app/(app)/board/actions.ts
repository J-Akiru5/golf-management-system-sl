"use server";

import { requireAccess } from "@/lib/access/server";
import type { BoardCard } from "@/lib/board/repo";
import {
  type CardFormValues,
  isPipelineStage,
  parseCardForm,
  parseQuickCreate,
} from "@/lib/board/validation";
import { getRepos } from "@/lib/repos";

/**
 * Server actions for the pipeline board.
 *
 * Each one validates its input again, calls the repository as the signed-in member, and returns a
 * plain result. Nothing here trusts the browser: row level security is still the real gate.
 */

export type CardResult = { ok: true; card: BoardCard } | { ok: false; message: string };
export type CardsResult = { ok: true; cards: BoardCard[] } | { ok: false; message: string };
export type DoneResult = { ok: true } | { ok: false; message: string };

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  return "Something went wrong. Try again.";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function createCardAction(input: {
  stage: string;
  title: string;
  clubName: string;
}): Promise<CardResult> {
  const parsed = parseQuickCreate({
    title: asString(input.title),
    clubName: asString(input.clubName),
  });
  if (!parsed.ok) return parsed;
  const stage = asString(input.stage);
  if (!isPipelineStage(stage)) return { ok: false, message: "Choose a stage." };

  try {
    await requireAccess("pipeline", "edit");
    const repos = await getRepos();
    const card = await repos.board.createCard({
      title: parsed.title,
      clubName: parsed.clubName,
      stage,
    });
    return { ok: true, card };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

export async function saveCardAction(input: {
  id: string;
  values: CardFormValues;
}): Promise<CardResult> {
  const id = asString(input.id);
  if (id === "") return { ok: false, message: "That card is no longer on the board." };

  const values = input.values;
  const parsed = parseCardForm({
    title: asString(values?.title),
    clubName: asString(values?.clubName),
    stage: asString(values?.stage),
    ownerId: asString(values?.ownerId),
    startDate: asString(values?.startDate),
    endDate: asString(values?.endDate),
    expectedPlayers: asString(values?.expectedPlayers),
    pricingModel: asString(values?.pricingModel),
    quotedAmount: asString(values?.quotedAmount),
    currency: asString(values?.currency),
    notes: asString(values?.notes),
    tournamentId: asString(values?.tournamentId),
  });
  if (!parsed.ok) return parsed;

  try {
    await requireAccess("pipeline", "edit");
    const repos = await getRepos();
    const card = await repos.board.updateCard(id, parsed.patch);
    return { ok: true, card };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

/**
 * Persist a move. `others` carries the target column's new positions when the move triggered a
 * rebalance. Every row is returned so the client can replace its optimistic copy with the saved one.
 */
export async function moveCardAction(input: {
  id: string;
  stage: string;
  position: number;
  others?: Array<{ id: string; position: number }>;
}): Promise<CardsResult> {
  const id = asString(input.id);
  const stage = asString(input.stage);
  if (id === "") return { ok: false, message: "That card is no longer on the board." };
  if (!isPipelineStage(stage)) return { ok: false, message: "Choose a stage." };
  if (typeof input.position !== "number" || !Number.isFinite(input.position)) {
    return { ok: false, message: "The new position is not a number." };
  }

  const others = Array.isArray(input.others) ? input.others.slice(0, 50) : [];
  for (const other of others) {
    if (asString(other.id) === "" || typeof other.position !== "number") {
      return { ok: false, message: "The rebalance was not valid." };
    }
  }

  try {
    await requireAccess("pipeline", "edit");
    const repos = await getRepos();
    const moved = await repos.board.moveCard({ id, stage, position: input.position });
    const updated = [moved];
    for (const other of others) {
      if (other.id === id) continue;
      updated.push(await repos.board.moveCard({ id: other.id, stage, position: other.position }));
    }
    return { ok: true, cards: updated };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

export async function deleteCardAction(id: string): Promise<DoneResult> {
  if (asString(id) === "") return { ok: false, message: "That card is no longer on the board." };
  try {
    await requireAccess("pipeline", "edit");
    const repos = await getRepos();
    await repos.board.deleteCard(id);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}
