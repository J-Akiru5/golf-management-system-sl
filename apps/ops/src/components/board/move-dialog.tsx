"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { BoardCard } from "@/lib/board/repo";
import { PIPELINE_STAGES } from "@/lib/db/constants";
import type { PipelineStage } from "@/lib/db/types";
import { cn } from "@/lib/ui/cn";

/**
 * Move a card without dragging: a plain list of stages. Every button is a normal button, so it
 * works with a finger and with a keyboard.
 */
export function MoveDialog({
  card,
  busy,
  onPick,
  onClose,
}: {
  card: BoardCard | null;
  busy: boolean;
  onPick: (stage: PipelineStage) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={card !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {card === null ? null : (
        <DialogContent title="Move card" description={card.title}>
          <div className="flex flex-col gap-1.5">
            {PIPELINE_STAGES.map((stage) => {
              const current = stage.id === card.stage;
              return (
                <button
                  key={stage.id}
                  type="button"
                  disabled={current || busy}
                  onClick={() => onPick(stage.id)}
                  className={cn(
                    "flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 text-left text-sm font-semibold",
                    current
                      ? "border-line bg-surface-sunken text-ink-muted"
                      : "border-line-strong text-ink hover:bg-surface-sunken",
                  )}
                >
                  <span>{stage.label}</span>
                  {current ? <span className="text-[12px] font-normal">Current</span> : null}
                </button>
              );
            })}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
