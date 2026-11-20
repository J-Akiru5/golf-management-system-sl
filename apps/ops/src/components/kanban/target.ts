/**
 * Turning a dnd-kit drop into a move the caller can apply.
 *
 * Kept separate from the component so it can be tested without a browser. The result uses
 * neighbour ids: `beforeId` is the card that ends up above the moved card, `afterId` the one below.
 */

export type KanbanColumn = {
  id: string;
  label: string;
};

export type KanbanItem = {
  id: string;
  columnId: string;
  position: number;
};

export type KanbanMove = {
  id: string;
  toColumnId: string;
  beforeId: string | null;
  afterId: string | null;
};

/** Droppable id for a whole column, so a card can be dropped into an empty space. */
export const COLUMN_PREFIX = "column:";

export function columnDroppableId(columnId: string): string {
  return `${COLUMN_PREFIX}${columnId}`;
}

export function sortItems<T extends KanbanItem>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    if (left.position !== right.position) return left.position - right.position;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

function columnItems<T extends KanbanItem>(
  items: readonly T[],
  columnId: string,
  excludeId: string,
): T[] {
  return sortItems(items.filter((item) => item.columnId === columnId && item.id !== excludeId));
}

function neighbours(
  items: readonly KanbanItem[],
  columnId: string,
  id: string,
): { beforeId: string | null; afterId: string | null } {
  const list = sortItems(items.filter((item) => item.columnId === columnId));
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return { beforeId: null, afterId: null };
  return { beforeId: list[index - 1]?.id ?? null, afterId: list[index + 1]?.id ?? null };
}

/**
 * The move for a finished drag, or null when nothing would change. Dropping on a column appends to
 * it; dropping on a card puts the dragged card in that card's place.
 */
export function resolveDrop(input: {
  activeId: string;
  overId: string | null;
  items: readonly KanbanItem[];
}): KanbanMove | null {
  const { activeId, overId, items } = input;
  if (overId === null || overId === activeId) return null;

  const active = items.find((item) => item.id === activeId);
  if (active === undefined) return null;
  const current = neighbours(items, active.columnId, activeId);

  if (overId.startsWith(COLUMN_PREFIX)) {
    const toColumnId = overId.slice(COLUMN_PREFIX.length);
    const list = columnItems(items, toColumnId, activeId);
    const beforeId = list[list.length - 1]?.id ?? null;
    const afterId = null;
    if (
      toColumnId === active.columnId &&
      beforeId === current.beforeId &&
      afterId === current.afterId
    ) {
      return null;
    }
    return { id: activeId, toColumnId, beforeId, afterId };
  }

  const over = items.find((item) => item.id === overId);
  if (over === undefined) return null;

  const list = columnItems(items, over.columnId, activeId);
  const index = list.findIndex((item) => item.id === overId);
  if (index < 0) return null;

  const beforeId = list[index - 1]?.id ?? null;
  const afterId = list[index]?.id ?? null;
  if (
    over.columnId === active.columnId &&
    beforeId === current.beforeId &&
    afterId === current.afterId
  ) {
    return null;
  }
  return { id: activeId, toColumnId: over.columnId, beforeId, afterId };
}
