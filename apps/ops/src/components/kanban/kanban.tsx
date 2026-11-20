"use client";

import {
  type Announcements,
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { cn } from "@/lib/ui/cn";
import {
  COLUMN_PREFIX,
  columnDroppableId,
  type KanbanColumn,
  type KanbanItem,
  type KanbanMove,
  resolveDrop,
  sortItems,
} from "./target";

export type { KanbanColumn, KanbanItem, KanbanMove } from "./target";

/**
 * Prefer a card under the pointer over the column around it, so a drop lands exactly where it was
 * released. The column wins only in the empty space of a column, which appends the card. Keyboard
 * drags have no pointer, so the intersection and nearest-centre checks take over.
 */
const boardCollisionDetection: CollisionDetection = (args) => {
  const isColumn = (id: string | number) => String(id).startsWith(COLUMN_PREFIX);

  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) {
    const cards = pointerHits.filter((hit) => !isColumn(hit.id));
    return cards.length > 0 ? cards : pointerHits;
  }

  const intersections = rectIntersection(args);
  if (intersections.length > 0) {
    const cards = intersections.filter((hit) => !isColumn(hit.id));
    return cards.length > 0 ? cards : intersections;
  }

  return closestCenter(args);
};

/**
 * A generic kanban board on dnd-kit.
 *
 * The component owns the drag plumbing only: columns, cards, the drag handle, the drop target and
 * screen reader announcements. It knows nothing about the pipeline, so the task board can use it
 * too. `renderCard` supplies the card's look and should leave the top-right corner clear for the
 * drag handle (about 3rem of padding, so the touch target stays 44px).
 */
export type KanbanProps<T extends KanbanItem> = {
  columns: readonly KanbanColumn[];
  items: readonly T[];
  renderCard: (item: T) => ReactNode;
  onMove: (move: KanbanMove) => void;
  disabled?: boolean;
  renderColumnHeader?: (column: KanbanColumn, count: number) => ReactNode;
  /** Rendered between the column header and its first card, for a per-column action. */
  renderColumnTop?: (column: KanbanColumn, count: number) => ReactNode;
  /** The name a screen reader hears for a card. Falls back to the card id. */
  getItemLabel?: (item: T) => string;
  emptyLabel?: string;
};

export function Kanban<T extends KanbanItem>({
  columns,
  items,
  renderCard,
  onMove,
  disabled = false,
  renderColumnHeader,
  renderColumnTop,
  getItemLabel,
  emptyLabel = "No cards",
}: KanbanProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // A short press begins a drag on a phone; a swipe still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byColumn = useMemo(() => {
    const grouped = new Map<string, T[]>();
    for (const column of columns) grouped.set(column.id, []);
    for (const item of items) {
      const list = grouped.get(item.columnId);
      if (list === undefined) grouped.set(item.columnId, [item]);
      else list.push(item);
    }
    for (const [columnId, list] of grouped) grouped.set(columnId, sortItems(list));
    return grouped;
  }, [columns, items]);

  const activeItem = activeId === null ? undefined : items.find((item) => item.id === activeId);

  const labelOf = (id: string): string => {
    const item = items.find((entry) => entry.id === id);
    if (item === undefined) return id;
    return getItemLabel?.(item) ?? item.id;
  };
  const columnLabelOf = (id: string): string =>
    columns.find((column) => column.id === id)?.label ?? id;
  const overLabel = (id: string): string =>
    id.startsWith("column:") ? columnLabelOf(id.slice("column:".length)) : labelOf(id);

  const announcements: Announcements = {
    onDragStart({ active }) {
      return `Picked up ${labelOf(String(active.id))}.`;
    },
    onDragOver({ active, over }) {
      if (over === null) return `${labelOf(String(active.id))} is not over a column.`;
      return `${labelOf(String(active.id))} is over ${overLabel(String(over.id))}.`;
    },
    onDragEnd({ active, over }) {
      if (over === null) return `${labelOf(String(active.id))} was dropped.`;
      return `${labelOf(String(active.id))} was dropped on ${overLabel(String(over.id))}.`;
    },
    onDragCancel({ active }) {
      return `Moving ${labelOf(String(active.id))} was cancelled.`;
    },
  };

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (disabled) return;
    const move = resolveDrop({
      activeId: String(event.active.id),
      overId: event.over === null ? null : String(event.over.id),
      items,
    });
    if (move !== null) onMove(move);
  }

  return (
    <DndContext
      id="teeline-kanban"
      sensors={disabled ? [] : sensors}
      collisionDetection={boardCollisionDetection}
      accessibility={{ announcements }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
        {columns.map((column) => (
          <KanbanColumnView
            key={column.id}
            column={column}
            items={byColumn.get(column.id) ?? []}
            renderCard={renderCard}
            renderColumnHeader={renderColumnHeader}
            renderColumnTop={renderColumnTop}
            getItemLabel={getItemLabel}
            disabled={disabled}
            emptyLabel={emptyLabel}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeItem === undefined ? null : (
          <div className="w-[272px] cursor-grabbing sm:w-[288px]">{renderCard(activeItem)}</div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumnView<T extends KanbanItem>({
  column,
  items,
  renderCard,
  renderColumnHeader,
  renderColumnTop,
  getItemLabel,
  disabled,
  emptyLabel,
}: {
  column: KanbanColumn;
  items: readonly T[];
  renderCard: (item: T) => ReactNode;
  renderColumnHeader?: (column: KanbanColumn, count: number) => ReactNode;
  renderColumnTop?: (column: KanbanColumn, count: number) => ReactNode;
  getItemLabel?: (item: T) => string;
  disabled: boolean;
  emptyLabel: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDroppableId(column.id),
    disabled,
    data: { columnId: column.id },
  });

  return (
    <section
      aria-label={column.label}
      className="flex w-[272px] flex-none snap-start flex-col gap-2 sm:w-[288px]"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        {renderColumnHeader === undefined ? (
          <>
            <h2 className="font-display text-sm font-bold text-ink">{column.label}</h2>
            <span className="tnum rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[11.5px] font-bold text-ink-muted">
              {items.length}
            </span>
          </>
        ) : (
          renderColumnHeader(column, items.length)
        )}
      </div>

      <ol
        ref={setNodeRef}
        className={cn(
          "flex max-h-[60dvh] min-h-[10rem] flex-col gap-2 overflow-y-auto rounded-lg border border-line bg-surface-sunken p-2 transition-colors",
          isOver && "border-gold ring-2 ring-gold/40",
        )}
      >
        {renderColumnTop === undefined ? null : (
          <li className="list-none">{renderColumnTop(column, items.length)}</li>
        )}
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <SortableCard
              key={item.id}
              item={item}
              label={getItemLabel?.(item) ?? item.id}
              disabled={disabled}
              renderCard={renderCard}
            />
          ))}
        </SortableContext>
        {items.length === 0 ? (
          <li className="px-2 py-6 text-center text-[13px] text-ink-muted">{emptyLabel}</li>
        ) : null}
      </ol>
    </section>
  );
}

function SortableCard<T extends KanbanItem>({
  item,
  label,
  disabled,
  renderCard,
}: {
  item: T;
  label: string;
  disabled: boolean;
  renderCard: (item: T) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "opacity-40")}
    >
      {disabled ? null : (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Move ${label}`}
          className="absolute right-0 top-0 z-10 grid size-11 cursor-grab touch-none place-items-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink active:cursor-grabbing"
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
      )}
      {renderCard(item)}
    </li>
  );
}
