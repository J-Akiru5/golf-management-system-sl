import type { PrintStartFormat, SortableStartGroup } from "@/lib/print/start-sheet";

export type { PrintStartFormat };

export type CourseDataStatus = "official" | "placeholder" | "missing";

/** The small, printable subset of a player record. No private profile fields belong here. */
export interface PrintPlayer {
  id: string;
  name: string;
  handicapIndex: number | null;
  playingHandicap: number | null;
  /** The tee the player is scored from: Blue, White, Silver or Red. */
  teeName: string | null;
  /** That tee's rating and slope, printed so the course handicap can be checked from the card. */
  teeRating?: number | null;
  teeSlope?: number | null;
  /** The NGAP number the card's QR code carries, so a player can link their record by scanning. */
  ngapId?: string | null;
  /** A signed or data URL only when internal photo consent is recorded. */
  photo?: string;
}

export interface PrintHole {
  number: number;
  par: number | null;
  strokeIndex: number | null;
}

export interface PrintGroup extends SortableStartGroup {
  flight: string;
  players: PrintPlayer[];
}

export type ScorecardGroup = Omit<PrintGroup, "players">;
