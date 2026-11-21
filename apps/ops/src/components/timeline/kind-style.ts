import type { TimelineKind } from "@/lib/timeline/types";

/**
 * One colour per kind, shared by the filter chips, the calendar chips, the agenda dots and the
 * Gantt bars, so a tournament is the same green in every view.
 *
 * The pairs come from the brand tokens: a soft token as the ground and its own ink token as the
 * text, which is the combination the token file guarantees is readable in light and dark. The
 * classes are written out in full because Tailwind reads them as text.
 */
export type KindStyle = {
  chip: string;
  dot: string;
  bar: string;
  line: string;
};

export const KIND_STYLE: Record<TimelineKind, KindStyle> = {
  tournament: {
    chip: "border-forest/50 bg-forest text-on-forest",
    dot: "bg-forest",
    bar: "border-forest bg-forest text-on-forest",
    line: "bg-forest",
  },
  card: {
    chip: "border-fairway/40 bg-fairway-soft text-ink",
    dot: "bg-fairway",
    bar: "border-fairway/50 bg-fairway-soft text-ink",
    line: "bg-fairway",
  },
  task: {
    chip: "border-info/40 bg-info-soft text-info",
    dot: "bg-info",
    bar: "border-info/50 bg-info-soft text-info",
    line: "bg-info",
  },
  milestone: {
    chip: "border-gold/60 bg-gold-soft text-gold-ink",
    dot: "bg-gold",
    bar: "border-gold bg-gold-soft text-gold-ink",
    line: "bg-gold",
  },
  release: {
    chip: "border-success/40 bg-success-soft text-success",
    dot: "bg-success",
    bar: "border-success/50 bg-success-soft text-success",
    line: "bg-success",
  },
};

/** The tournament prep segment: the same green, softened, with a dashed edge to read as "before". */
export const PREP_SEGMENT_CLASS = "border border-dashed border-fairway/60 bg-fairway-soft/70";
