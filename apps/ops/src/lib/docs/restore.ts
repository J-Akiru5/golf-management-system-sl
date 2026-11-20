import type { EditorJson } from "@/lib/db/types";
import { SNAPSHOT_NAME_MAX } from "./repo";

/**
 * A restore is a sequence, not a single write. SPEC section 6 and the brief: save the current
 * document as a `pre_restore` snapshot first, then apply the older content as a new edit, so the
 * history keeps both sides. Kept pure so the order is testable without an editor.
 */

export type RestoreStep =
  | { op: "create_snapshot"; kind: "pre_restore"; name: string }
  | { op: "apply_content"; content: EditorJson };

export const PRE_RESTORE_PREFIX = "Before restore: ";

export function beforeRestoreName(snapshotName: string): string {
  const name = `${PRE_RESTORE_PREFIX}${snapshotName.trim()}`;
  return name.length <= SNAPSHOT_NAME_MAX ? name : name.slice(0, SNAPSHOT_NAME_MAX);
}

export function planRestore(input: {
  snapshot: { name: string; content: EditorJson };
}): RestoreStep[] {
  return [
    { op: "create_snapshot", kind: "pre_restore", name: beforeRestoreName(input.snapshot.name) },
    { op: "apply_content", content: input.snapshot.content },
  ];
}

/** What the editor says after a restore has run, naming both sides of the history. */
export function restoreNotice(snapshotName: string): string {
  return `Restored "${snapshotName.trim()}". The version before it was saved as "${beforeRestoreName(snapshotName)}".`;
}
