"use client";

import { Radio, Undo2 } from "lucide-react";
import { RoleGate } from "@/components/desk";
import { useDesk } from "@/lib/store/desk-store";
import { cn } from "@/lib/ui/cn";

/** The time a list was published, on the desk's own clock. */
function publishedTime(at: string): string {
  return new Date(at).toLocaleTimeString("en-PH", { timeStyle: "short" });
}

/**
 * The Live mode bar on the pairings board.
 *
 * During a live event the desk cannot stop after every swap to review and publish, and it cannot take
 * back a mistaken one. This bar switches board edits to publish by themselves, and offers one-step
 * undo. It only asks the store; the store owns the debounce, the publish checks and the undo stack.
 */
export function LiveModeBar() {
  const {
    draw,
    liveMode,
    setLiveMode,
    canUndo,
    undoLastChange,
    publishState,
    publishError,
    published,
    changedSincePublish,
    member,
  } = useDesk();

  // Nothing to switch on or take back before there is a board.
  if (!draw) return null;

  const publishing = publishState === "working";
  const failing = publishState === "failed";

  return (
    <div
      className="card flex flex-wrap items-center gap-x-3 gap-y-2 !py-3"
      role="group"
      aria-label="Live board"
    >
      <span className={cn("pill", liveMode ? "ok" : "info")}>
        {liveMode ? "Live on" : "Live off"}
      </span>

      <RoleGate
        role={member?.role}
        allow={["owner", "organizer"]}
        mode="disable"
        disabledReason="Only the owner or an organizer can publish, so only they can use Live mode."
      >
        <button
          type="button"
          role="switch"
          aria-checked={liveMode}
          className={cn("btn", liveMode ? "gold" : "ghost")}
          onClick={() => setLiveMode(!liveMode)}
        >
          <Radio className="size-4" aria-hidden="true" />
          Live mode: {liveMode ? "on" : "off"}
        </button>
      </RoleGate>

      <button type="button" className="btn ghost" disabled={!canUndo} onClick={undoLastChange}>
        <Undo2 className="size-4" aria-hidden="true" />
        Undo last change
      </button>

      <p className="hint m-0 w-full" aria-live="polite">
        {publishing ? (
          <b>Publishing…</b>
        ) : failing ? (
          <span className="text-danger">
            <b>Not published.</b> {publishError ?? "The pairings were not saved."}
          </span>
        ) : published ? (
          <>
            Published {publishedTime(published.at)}
            {published.version ? ` (version ${published.version})` : ""}.
            {changedSincePublish && <> The board has changes players cannot see yet.</>}
          </>
        ) : (
          <>Not published yet. Players see nothing until you publish.</>
        )}
      </p>

      <p className="hint m-0 w-full">
        {liveMode
          ? "Every board change publishes by itself about two seconds after the last one, so a run of moves goes out once."
          : "Board changes wait for you to review and publish them."}{" "}
        Undo takes back the last change on this board, in this tab only; it starts empty again when
        the page reloads.
      </p>
    </div>
  );
}
