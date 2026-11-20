"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCardAction,
  deleteCardAction,
  moveCardAction,
  saveCardAction,
} from "@/app/(app)/board/actions";
import { Kanban, type KanbanColumn, type KanbanMove } from "@/components/kanban/kanban";
import { Badge } from "@/components/ui/badge";
import {
  type BoardFilter,
  filterCards,
  hasUndatedCards,
  monthsIn,
  quotedTotals,
} from "@/lib/board/filters";
import { formatMoney } from "@/lib/board/format";
import { removeCard, upsertCard } from "@/lib/board/merge";
import { applyMove, sortColumn } from "@/lib/board/order";
import { boardEventFromBroadcast } from "@/lib/board/realtime";
import type { BoardCard, BoardMember, BoardTournament } from "@/lib/board/repo";
import { type CardFormValues, isPipelineStage } from "@/lib/board/validation";
import { channels, PIPELINE_STAGES } from "@/lib/db/constants";
import type { PipelineStage } from "@/lib/db/types";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { BoardFilters } from "./board-filters";
import { CardSheet } from "./card-sheet";
import { CardTile } from "./card-tile";
import { type LiveState, LiveStatus } from "./live-status";
import { MoveDialog } from "./move-dialog";
import { QuickAdd } from "./quick-add";

type BoardItem = BoardCard & { columnId: string };

const COLUMNS: KanbanColumn[] = PIPELINE_STAGES.map((stage) => ({
  id: stage.id,
  label: stage.label,
}));

/**
 * The pipeline board.
 *
 * Moves are applied locally first and saved after. A failed save restores only the cards the move
 * touched, so an unrelated update that arrived meanwhile is kept. Realtime events are hints: a
 * stale row or our own echo changes nothing, and a card with a move in flight is left alone.
 */
export function BoardView({
  initialCards,
  members,
  tournaments,
  canDelete,
  demo,
}: {
  initialCards: BoardCard[];
  members: BoardMember[];
  tournaments: BoardTournament[];
  canDelete: boolean;
  demo: boolean;
}) {
  const [cards, setCards] = useState<BoardCard[]>(initialCards);
  const [filter, setFilter] = useState<BoardFilter>({});
  const [message, setMessage] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<LiveState>(demo ? "demo" : "reconnecting");

  const cardsRef = useRef<BoardCard[]>(initialCards);
  const inFlight = useRef<Set<string>>(new Set());

  const commit = (next: BoardCard[]) => {
    cardsRef.current = next;
    setCards(next);
  };

  const visible = useMemo(() => filterCards(cards, filter), [cards, filter]);
  const months = useMemo(() => monthsIn(cards), [cards]);
  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.user_id, member.display_name])),
    [members],
  );

  const items: BoardItem[] = useMemo(
    () => visible.map((card) => ({ ...card, columnId: card.stage })),
    [visible],
  );

  const selectedCard = openId === null ? null : (cards.find((card) => card.id === openId) ?? null);
  const movingCard =
    movingId === null ? null : (cards.find((card) => card.id === movingId) ?? null);

  // A card can disappear under the sheet or the move dialog when someone else deletes it.
  useEffect(() => {
    if (openId !== null && !cards.some((card) => card.id === openId)) setOpenId(null);
    if (movingId !== null && !cards.some((card) => card.id === movingId)) setMovingId(null);
  }, [cards, openId, movingId]);

  useEffect(() => {
    if (demo) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    async function start() {
      try {
        const client = getBrowserSupabase();
        // The private channel carries the member's token.
        await client.realtime.setAuth();
        if (cancelled) return;

        const handle = (event: string) => (payload: unknown) => {
          const parsed = boardEventFromBroadcast(event, payload);
          if (parsed === null) return;
          const current = cardsRef.current;
          const next =
            parsed.kind === "delete"
              ? removeCard(current, parsed.id, inFlight.current)
              : upsertCard(current, parsed.card, inFlight.current);
          if (next !== current) commit(next);
        };

        channel = client.channel(channels.board, { config: { private: true } });
        channel
          .on("broadcast", { event: "INSERT" }, handle("INSERT"))
          .on("broadcast", { event: "UPDATE" }, handle("UPDATE"))
          .on("broadcast", { event: "DELETE" }, handle("DELETE"))
          .subscribe((status) => {
            if (cancelled) return;
            setLiveState(status === "SUBSCRIBED" ? "live" : "reconnecting");
          });
      } catch {
        if (!cancelled) setLiveState("reconnecting");
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (channel !== null) void getBrowserSupabase().removeChannel(channel);
    };
  }, [demo]);

  async function runMove(
    id: string,
    toStage: PipelineStage,
    beforeId: string | null,
    afterId: string | null,
  ) {
    const snapshot = cardsRef.current;
    const result = (() => {
      try {
        return applyMove(snapshot, { id, toStage, beforeId, afterId });
      } catch {
        return null;
      }
    })();
    if (result === null || result.updates.length === 0) return;

    const affected = new Map(
      snapshot
        .filter((card) => result.updates.some((update) => update.id === card.id))
        .map((card) => [card.id, card]),
    );

    commit(result.cards);
    inFlight.current.add(id);
    setMessage(null);

    const others = result.updates.filter((update) => update.id !== id);
    const response = await moveCardAction({
      id,
      stage: toStage,
      position: result.position,
      others,
    });
    inFlight.current.delete(id);

    if (!response.ok) {
      // Restore only the cards this move changed; anything else that arrived stays.
      commit(cardsRef.current.map((card) => affected.get(card.id) ?? card));
      setMessage(response.message);
      return;
    }

    let next = cardsRef.current;
    for (const card of response.cards) next = upsertCard(next, card);
    commit(next);
  }

  function handleKanbanMove(move: KanbanMove) {
    if (!isPipelineStage(move.toColumnId)) return;
    void runMove(move.id, move.toColumnId, move.beforeId, move.afterId);
  }

  function handleMoveToStage(stage: PipelineStage) {
    if (movingCard === null) return;
    const target = sortColumn(cardsRef.current.filter((card) => card.stage === stage));
    const beforeId = target[target.length - 1]?.id ?? null;
    setMovingId(null);
    void runMove(movingCard.id, stage, beforeId, null);
  }

  async function handleCreate(
    stage: PipelineStage,
    values: { title: string; clubName: string },
  ): Promise<string | null> {
    const response = await createCardAction({ stage, ...values });
    if (!response.ok) return response.message;
    // A realtime INSERT hint may already have added this card; merge by id either way.
    commit(upsertCard(cardsRef.current, response.card));
    return null;
  }

  async function handleSave(id: string, values: CardFormValues): Promise<string | null> {
    inFlight.current.add(id);
    const response = await saveCardAction({ id, values });
    inFlight.current.delete(id);
    if (!response.ok) return response.message;
    commit(upsertCard(cardsRef.current, response.card));
    setOpenId(null);
    setMessage(null);
    return null;
  }

  async function handleDelete(id: string): Promise<string | null> {
    inFlight.current.add(id);
    const response = await deleteCardAction(id);
    inFlight.current.delete(id);
    if (!response.ok) return response.message;
    commit(cardsRef.current.filter((card) => card.id !== id));
    setOpenId(null);
    setMessage(null);
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="overline">Pipeline</p>
          <h1 className="mt-1 text-2xl">Tournament pipeline</h1>
          <p className="hint mt-0.5">
            Drag a card, use its Move button, or open it for every field. Filters only change what
            is shown.
          </p>
        </div>
        <LiveStatus state={liveState} />
      </div>

      <BoardFilters
        filter={filter}
        members={members}
        months={months}
        showNoDate={hasUndatedCards(cards)}
        onChange={setFilter}
      />

      {cards.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-strong px-3 py-2 text-sm text-ink-muted">
          The pipeline is empty. Add the first card in any column.
        </p>
      ) : null}

      {message === null ? null : (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger px-3 py-2 text-sm text-danger"
        >
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="rounded-sm px-2 py-1 text-[12px] font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <Kanban
        columns={COLUMNS}
        items={items}
        onMove={handleKanbanMove}
        getItemLabel={(item) => item.title}
        renderCard={(item) => (
          <CardTile
            card={item}
            ownerName={item.owner_id === null ? null : (memberNames.get(item.owner_id) ?? null)}
            onOpen={() => setOpenId(item.id)}
            onMove={() => setMovingId(item.id)}
          />
        )}
        renderColumnHeader={(column, count) => {
          const totals = quotedTotals(items.filter((item) => item.columnId === column.id));
          return (
            <div className="flex w-full flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-bold text-ink">{column.label}</h2>
                <Badge tone="neutral" className="tnum">
                  {count}
                </Badge>
              </div>
              {totals.length === 0 ? null : (
                <p className="tnum text-[11px] text-ink-muted">
                  {totals.map((entry) => formatMoney(entry.total, entry.currency)).join(" + ")}
                </p>
              )}
            </div>
          );
        }}
        renderColumnTop={(column) => (
          <QuickAdd
            stageLabel={column.label}
            onCreate={(values) =>
              isPipelineStage(column.id)
                ? handleCreate(column.id, values)
                : Promise.resolve("Choose a stage.")
            }
          />
        )}
      />

      {visible.length === 0 && cards.length > 0 ? (
        <p className="text-sm text-ink-muted">
          No cards match these filters. Clear them to see the whole pipeline.
        </p>
      ) : null}

      {selectedCard === null ? null : (
        <CardSheet
          key={selectedCard.id}
          card={selectedCard}
          canDelete={canDelete}
          members={members}
          tournaments={tournaments}
          onClose={() => setOpenId(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}

      <MoveDialog
        card={movingCard}
        busy={false}
        onPick={handleMoveToStage}
        onClose={() => setMovingId(null)}
      />
    </div>
  );
}
