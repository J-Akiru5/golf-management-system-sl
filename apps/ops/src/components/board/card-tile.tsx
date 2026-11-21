import { MoveRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateRange, formatMoney, formatPlayers, pricingLabel } from "@/lib/board/format";
import type { BoardCard } from "@/lib/board/repo";

/**
 * One pipeline card on the board. The title opens the detail sheet; the drag handle is supplied by
 * the kanban above it, which is why the title reserves room at the top right.
 */
export function CardTile({
  card,
  ownerName,
  onOpen,
  onMove,
}: {
  card: BoardCard;
  ownerName: string | null;
  onOpen: () => void;
  /** Absent at view level: the card can be opened but not moved. */
  onMove?: () => void;
}) {
  const amount =
    card.quoted_amount === null ? null : formatMoney(card.quoted_amount, card.currency);
  const players = formatPlayers(card.expected_players);
  const pricing = pricingLabel(card.pricing_model);

  return (
    <Card className="p-3">
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 rounded-sm pr-9 text-left"
          aria-label={`Open ${card.title}`}
        >
          <span className="line-clamp-2 font-display text-sm font-bold leading-tight text-ink">
            {card.title}
          </span>
        </button>
        <p className="truncate text-[13px] text-ink-muted">{card.club_name}</p>
      </div>

      <p className="mt-2 tnum text-[12px] text-ink-muted">
        {formatDateRange(card.start_date, card.end_date)}
      </p>
      {players === null ? null : <p className="tnum text-[12px] text-ink-muted">{players}</p>}

      {amount === null && pricing === null ? null : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {amount === null ? null : (
            <span className="tnum text-sm font-semibold text-ink">{amount}</span>
          )}
          {pricing === null ? null : <Badge tone="neutral">{pricing}</Badge>}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {card.owner_id === null ? (
            <span className="text-[12px] text-ink-muted">Unassigned</span>
          ) : ownerName === null ? (
            <span className="text-[12px] text-ink-muted">Unknown member</span>
          ) : (
            <>
              <Avatar id={card.owner_id} name={ownerName} size="sm" />
              <span className="truncate text-[12px] text-ink-muted">{ownerName}</span>
            </>
          )}
        </div>
        {onMove ? (
          <button
            type="button"
            onClick={onMove}
            className="inline-flex h-11 flex-none items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-ink-muted hover:bg-surface-sunken hover:text-ink sm:h-8"
            aria-label={`Move ${card.title} to another stage`}
          >
            <MoveRight className="size-3.5" aria-hidden="true" />
            Move
          </button>
        ) : null}
      </div>
    </Card>
  );
}
