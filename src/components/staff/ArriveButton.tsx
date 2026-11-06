"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useDesk } from "@/lib/store/desk-store";
import styles from "./staff.module.css";

type Phase = "idle" | "saving" | "error";

/**
 * The one-tap arrival. It says Saving… while the write is in flight, keeps a failure on screen with
 * Retry, and turns the same button into Undo once the player is here.
 */
export function ArriveButton({
  entryId,
  dayNumber,
  name,
  arrived,
  compact = false,
}: {
  entryId: string;
  dayNumber: number;
  name: string;
  arrived: boolean;
  compact?: boolean;
}) {
  const { adapters } = useDesk();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");

  async function toggle() {
    setPhase("saving");
    setError("");
    try {
      await adapters.registrations.checkIn(entryId, dayNumber, !arrived);
      toast.push({
        title: arrived ? `${name} is expected again` : `${name} checked in`,
        detail: arrived ? "The arrival was undone." : "The desk sees the time and who marked it.",
        tone: arrived ? "info" : "ok",
      });
      setPhase("idle");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setPhase("error");
    }
  }

  return (
    <span style={{ display: "grid", gap: 4 }}>
      <button
        type="button"
        className={styles.rowAction}
        data-arrived={arrived}
        data-busy={phase === "saving"}
        disabled={phase === "saving"}
        onClick={() => void toggle()}
        aria-label={arrived ? `Undo arrival for ${name}` : `Mark ${name} arrived`}
      >
        {phase === "saving"
          ? "Saving…"
          : phase === "error"
            ? "Retry"
            : arrived
              ? "Undo"
              : compact
                ? "Arrive"
                : "Arrived"}
      </button>
      {phase === "error" && (
        <span className={styles.error} role="alert" style={{ maxWidth: 200 }}>
          {error}
        </span>
      )}
    </span>
  );
}
