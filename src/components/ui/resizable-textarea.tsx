"use client";

import {
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/ui/cn";
import {
  clampHeight,
  draggedHeight,
  fitTextareaHeight,
  keyboardHeight,
  RESIZE_STEP,
  TEXTAREA_MIN_HEIGHT,
} from "@/lib/ui/textarea-size";

/** A drag shorter than this is a click on the edge, not a request to resize. */
const DRAG_START = 3;

/** Keeps one over-enthusiastic drag from turning the page into a single field. */
const MAX_HEIGHT = 1200;

type Edge = "top" | "bottom";

/**
 * A textarea that shows its whole value by default and can be made taller from any point on its top
 * or bottom edge. The browser only offers the small corner grip, which is easy to miss and hard to
 * hit; the desk asked for the whole edge. The edges are focusable separators as well, so the same
 * control works from the keyboard and not only by dragging.
 */
export function ResizableTextarea({
  className,
  value,
  rows = 2,
  resizeLabel = "text field",
  minHeight = TEXTAREA_MIN_HEIGHT,
  maxHeight = MAX_HEIGHT,
  ...props
}: ComponentProps<"textarea"> & {
  /** Used in the edge labels, e.g. "Resize Desk instructions from the top edge". */
  resizeLabel?: string;
  minHeight?: number;
  maxHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const drag = useRef<{
    pointerId: number;
    edge: Edge;
    startY: number;
    startHeight: number;
    moved: boolean;
  } | null>(null);
  const [fit, setFit] = useState(minHeight);
  const [manual, setManual] = useState<number | null>(null);
  const ceiling = Math.max(maxHeight, fit);
  const height = clampHeight(Math.max(fit, manual ?? 0), fit, ceiling);

  /**
   * A textarea's scrollHeight is never smaller than its current height, so the height has to be
   * released before the content can be measured. The old inline value is put back in the same
   * layout pass, before anything paints.
   */
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const previous = el.style.height;
    el.style.height = "auto";
    const border = el.offsetHeight - el.clientHeight;
    const next = fitTextareaHeight(el.scrollHeight, border, minHeight);
    el.style.height = previous;
    setFit((current) => (Math.abs(current - next) < 1 ? current : next));
  }, [minHeight]);

  useLayoutEffect(() => {
    measure();
  }, [measure, value]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = `${height}px`;
  }, [height]);

  // The same text wraps onto more lines in a narrow column, so the fit has to follow the width.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      measure();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  // Bundled fonts can arrive after the first measure, and a wider glyph can add a line.
  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => {
      if (live) measure();
    });
    return () => {
      live = false;
    };
  }, [measure]);

  const startDrag = (edge: Edge) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (props.disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    drag.current = {
      pointerId: event.pointerId,
      edge,
      startY: event.clientY,
      startHeight: el.getBoundingClientRect().height,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    // Keep the text selection from starting under the drag.
    event.preventDefault();
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moved && Math.abs(event.clientY - current.startY) < DRAG_START) return;
    current.moved = true;
    const next = draggedHeight({
      edge: current.edge,
      startHeight: current.startHeight,
      startY: current.startY,
      currentY: event.clientY,
      minHeight: fit,
      maxHeight: ceiling,
    });
    setManual(next > fit ? next : null);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = keyboardHeight({
      key: event.key,
      currentHeight: height,
      minHeight: fit,
      maxHeight: ceiling,
      step: event.shiftKey ? RESIZE_STEP * 2 : RESIZE_STEP,
    });
    if (next === null) return;
    event.preventDefault();
    setManual(next > fit ? next : null);
  };

  const edge = (side: Edge) => (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={`Resize ${resizeLabel} from the ${side} edge`}
      aria-valuemin={Math.round(fit)}
      aria-valuemax={Math.round(ceiling)}
      aria-valuenow={Math.round(height)}
      aria-valuetext={`${Math.round(height)} pixels tall`}
      aria-controls={props.id}
      aria-keyshortcuts="ArrowUp ArrowDown PageUp PageDown Home End"
      tabIndex={props.disabled ? -1 : 0}
      className={cn(
        "resize-edge",
        side === "top" ? "resize-edge-top" : "resize-edge-bottom",
        props.disabled && "resize-edge-off",
      )}
      title="Drag to resize. Double-click to fit the text. Arrow keys work when the edge is focused."
      onPointerDown={startDrag(side)}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={() => setManual(null)}
    />
  );

  return (
    <div className="resizable-textarea">
      {edge("top")}
      <textarea
        {...props}
        ref={ref}
        rows={rows}
        value={value}
        className={className}
        aria-describedby={
          [props["aria-describedby"], hintId].filter(Boolean).join(" ") || undefined
        }
      />
      {edge("bottom")}
      <span id={hintId} className="sr">
        Grows with its text. Drag the top or bottom edge to make it taller. When an edge is focused,
        the arrow keys resize it, Home fits the text and End opens it fully.
      </span>
    </div>
  );
}
