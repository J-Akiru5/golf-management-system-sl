"use client";

import { ReadyOverrideDialog } from "@/components/desk/ReadyOverrideDialog";
import type { OverrideReadyInput } from "@/lib/data/adapters";
import { selectIndexForCutOff } from "@/lib/data/frozen";
import type {
  DeskRegistration,
  HandicapRecord,
  PlayerRecord,
  RegistrationEntry,
  Tournament,
} from "@/lib/data/types";
import type { Tee } from "@/lib/routing";

/**
 * The index and class edit, opened from a player row on the pairings board.
 *
 * It is the desk's existing ready-override dialog in its edit mode, so the fields, the committee
 * adjustment, the reason and the save path stay in one place: the register list and the player page
 * keep behaving exactly as they do. This wrapper only supplies what the board knows, which is the
 * player's cut-off record; a ready entry therefore opens on the index the event uses now.
 *
 * The save goes through `adapters.registrations.overrideReady`, exactly as the player page does. It
 * changes the entry (index, playing handicap and class), never the draw: a player stays in the group
 * they were drawn in, and any class mismatch is reported on the board.
 */
export function PlayerIndexDialog({
  open,
  onOpenChange,
  player,
  entry,
  registration,
  tournament,
  tees,
  records,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: PlayerRecord;
  entry: RegistrationEntry;
  registration: DeskRegistration;
  tournament: Tournament;
  tees: Tee[];
  /** The player's handicap records, so the dialog can name the cut-off index. */
  records: HandicapRecord[];
  onSave: (input: OverrideReadyInput) => void;
}) {
  const cutOff = selectIndexForCutOff(records, tournament.cutOffDate ?? "");
  return (
    <ReadyOverrideDialog
      open={open}
      onOpenChange={onOpenChange}
      player={player}
      entry={entry}
      registration={registration}
      tournament={tournament}
      tees={tees}
      cutOffDate={tournament.cutOffDate ?? null}
      cutOffIndex={cutOff.index}
      cutOffIndexDate={cutOff.record?.effectiveDate ?? null}
      newerIndexDate={cutOff.newer?.effectiveDate ?? null}
      onSave={onSave}
    />
  );
}
