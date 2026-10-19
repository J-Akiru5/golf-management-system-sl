/**
 * Height arithmetic for a textarea that shows its whole value and can be made taller by dragging
 * either horizontal edge. The component measures the textarea; this module only decides a height,
 * so the edges and the keyboard steps can be checked without a browser.
 */

export type ResizeEdge = "top" | "bottom";

/** One arrow-key press, and one Page key press, in pixels. */
export const RESIZE_STEP = 24;
export const RESIZE_PAGE = RESIZE_STEP * 4;

/** Empty textareas still need room for two lines and the label above them. */
export const TEXTAREA_MIN_HEIGHT = 64;

/** Keeps a height between the content and the largest height the screen can usefully show. */
export function clampHeight(value: number, minHeight: number, maxHeight: number): number {
  const low = Math.min(minHeight, maxHeight);
  const high = Math.max(minHeight, maxHeight);
  if (!Number.isFinite(value)) return low;
  return Math.min(Math.max(value, low), high);
}

/**
 * The height the text needs. `scrollHeight` includes the padding but not the border, and a
 * border-box textarea must include both or the last line loses a pixel.
 */
export function fitTextareaHeight(
  scrollHeight: number,
  borderHeight: number,
  minHeight: number,
): number {
  if (!Number.isFinite(scrollHeight) || scrollHeight <= 0) return minHeight;
  return Math.max(minHeight, Math.ceil(scrollHeight + Math.max(0, borderHeight)));
}

/**
 * A drag moves one edge. Pulling the top edge up and the bottom edge down both make the field
 * taller; the opposite direction makes it shorter. It never goes below the text, so no drag can
 * hide a line.
 */
export function draggedHeight({
  edge,
  startHeight,
  startY,
  currentY,
  minHeight,
  maxHeight,
}: {
  edge: ResizeEdge;
  startHeight: number;
  startY: number;
  currentY: number;
  minHeight: number;
  maxHeight: number;
}): number {
  const delta = edge === "top" ? startY - currentY : currentY - startY;
  return clampHeight(startHeight + delta, minHeight, maxHeight);
}

/**
 * The same height change from the keyboard, so a textarea whose size can be dragged is not a
 * mouse-only control. Home fits the text again; End opens it to the largest allowed height.
 */
export function keyboardHeight({
  key,
  currentHeight,
  minHeight,
  maxHeight,
  step = RESIZE_STEP,
}: {
  key: string;
  currentHeight: number;
  minHeight: number;
  maxHeight: number;
  step?: number;
}): number | null {
  switch (key) {
    case "ArrowUp":
    case "PageUp":
      return clampHeight(
        currentHeight + (key === "PageUp" ? Math.max(step, RESIZE_PAGE) : step),
        minHeight,
        maxHeight,
      );
    case "ArrowDown":
    case "PageDown":
      return clampHeight(
        currentHeight - (key === "PageDown" ? Math.max(step, RESIZE_PAGE) : step),
        minHeight,
        maxHeight,
      );
    case "Home":
      return clampHeight(minHeight, minHeight, maxHeight);
    case "End":
      return clampHeight(maxHeight, minHeight, maxHeight);
    default:
      return null;
  }
}
