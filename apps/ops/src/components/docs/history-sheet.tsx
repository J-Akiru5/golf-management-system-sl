"use client";

import { RotateCcw, Trash } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatWhen } from "@/lib/docs/format";
import { previewBlocks } from "@/lib/docs/preview";
import type { DocSnapshot } from "@/lib/docs/repo";
import { cn } from "@/lib/ui/cn";

const KIND_LABEL: Record<DocSnapshot["kind"], string> = {
  manual: "Saved by hand",
  auto: "Automatic",
  pre_restore: "Before a restore",
};

type Confirm = { id: string; action: "restore" | "delete" } | null;

/** The version list in a side sheet: name, time, author, a plain preview, and the two actions. */
export function HistorySheet({
  open,
  onOpenChange,
  snapshots,
  busy,
  canRestore,
  canDelete,
  onRestore,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshots: DocSnapshot[];
  busy: boolean;
  canRestore: boolean;
  canDelete: boolean;
  onRestore: (snapshot: DocSnapshot) => void;
  onDelete: (snapshot: DocSnapshot) => void;
}) {
  const [confirm, setConfirm] = useState<Confirm>(null);

  function change(next: boolean) {
    if (!next) setConfirm(null);
    onOpenChange(next);
  }

  return (
    <Sheet open={open} onOpenChange={change}>
      <SheetContent
        title="Version history"
        description="Newest first. A restore saves the current version before it changes anything."
      >
        {snapshots.length === 0 ? (
          <p className="hint">
            No versions saved yet. Use Save version before a big change, then you can return to it.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {snapshots.map((snapshot) => {
              const answering = confirm?.id === snapshot.id ? confirm.action : null;
              const blocks = previewBlocks(snapshot.content, 4);
              return (
                <li key={snapshot.id}>
                  <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-raised p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-base font-bold text-ink">{snapshot.name}</p>
                      {snapshot.kind === "manual" ? null : (
                        <Badge tone="neutral">{KIND_LABEL[snapshot.kind]}</Badge>
                      )}
                    </div>
                    <p className="hint tnum">
                      {formatWhen(snapshot.createdAt)}
                      {snapshot.createdByName ? ` by ${snapshot.createdByName}` : ""}
                    </p>

                    {blocks.length > 0 ? (
                      <div className="rounded-sm border border-line bg-surface p-2 text-sm text-ink">
                        {blocks.map((block, index) => (
                          <p
                            key={`${snapshot.id}-${index}`}
                            className={cn(
                              "truncate",
                              block.kind === "heading" && "font-display font-bold",
                              block.kind === "list-item" && "pl-3 before:mr-1 before:content-['-']",
                            )}
                          >
                            {block.text}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="hint">This version has no text.</p>
                    )}

                    {answering === "restore" ? (
                      <div className="flex flex-col gap-2 rounded-sm border border-line bg-surface p-2">
                        <p className="text-sm text-ink">
                          Restore &quot;{snapshot.name}&quot;? The version in the document now is
                          saved first, so you can come back to it.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={busy}
                            onClick={() => {
                              setConfirm(null);
                              onRestore(snapshot);
                            }}
                          >
                            Restore this version
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {answering === "delete" ? (
                      <div className="flex flex-col gap-2 rounded-sm border border-line bg-surface p-2">
                        <p className="text-sm text-ink">
                          Delete &quot;{snapshot.name}&quot;? This cannot be undone.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busy}
                            onClick={() => {
                              setConfirm(null);
                              onDelete(snapshot);
                            }}
                          >
                            Delete version
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {answering === null && (canRestore || canDelete) ? (
                      <div className="flex flex-wrap gap-2">
                        {canRestore ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => setConfirm({ id: snapshot.id, action: "restore" })}
                          >
                            <RotateCcw />
                            Restore
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            disabled={busy}
                            onClick={() => setConfirm({ id: snapshot.id, action: "delete" })}
                          >
                            <Trash />
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
