"use client";

import { Check, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useDesk } from "@/lib/store/desk-store";
import type { StaffRow } from "@/lib/staff/rows";
import styles from "./roster.module.css";
import { useStaffToast } from "./StaffToast";

/** A stored arrival stamp as the club's clock, so the text does not change with the phone's zone. */
function arrivedClock(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      hour: "numeric",
      minute: "2-digit",
    }).format(at);
  } catch {
    const hours = at.getHours();
    const suffix = hours >= 12 ? "PM" : "AM";
    const shown = hours % 12 === 0 ? 12 : hours % 12;
    return `${shown}:${String(at.getMinutes()).padStart(2, "0")} ${suffix}`;
  }
}

/**
 * One player on a group's roster. The whole row is the arrival control: one tap marks them here,
 * one more tap puts them back to expected. The write is optimistic, and a refused write puts the
 * row back where it was with the reason and a Retry, so the roster never claims an arrival the desk
 * did not record. The small button beside it opens the player's details instead.
 */
export function RosterRow({
  row,
  dayNumber,
  onDetails,
}: {
  row: StaffRow;
  dayNumber: number;
  onDetails: () => void;
}) {
  const { adapters } = useDesk();
  const toast = useStaffToast();
  const [phase, setPhase] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");
  // What the row shows before the desk answers. Null means: trust the saved row.
  const [hope, setHope] = useState<boolean | null>(null);
  const [hopedAt, setHopedAt] = useState<string | null>(null);
  // The write that failed, so Retry repeats that one rather than the opposite.
  const [failedTarget, setFailedTarget] = useState(false);

  const arrived = hope ?? row.arrived;

  // Once the saved row agrees with the optimistic value, the saved value takes over.
  useEffect(() => {
    if (hope === null || row.arrived !== hope) return;
    setHope(null);
    setHopedAt(null);
  }, [hope, row.arrived]);

  async function write(next: boolean, fromToast = false) {
    const stamp = next ? new Date().toISOString() : null;
    setPhase("saving");
    setError("");
    setFailedTarget(next);
    setHope(next);
    setHopedAt(stamp);
    try {
      await adapters.registrations.checkIn(row.entryId, dayNumber, next);
      setPhase("idle");
      if (next) {
        const at = arrivedClock(stamp);
        toast.push({
          title: `${row.name} checked in`,
          detail: at ? `Arrived ${at}. The desk sees the time.` : "The desk sees the arrival.",
          tone: "ok",
          actionLabel: "Undo",
          onAction: () => {
            void write(false, true);
          },
        });
      } else {
        toast.push({
          title: `${row.name} is expected again`,
          detail: "The arrival was undone.",
          tone: "info",
        });
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setHope(null);
      setHopedAt(null);
      setPhase("error");
      setError(message);
      if (fromToast) {
        toast.push({
          title: "Could not undo the arrival",
          detail: message,
          tone: "bad",
        });
      }
    }
  }

  const arrival = arrived ? arrivedClock(row.arrivedAt ?? hopedAt) : "";

  return (
    <li className={styles.item}>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.arrive}
          data-arrived={arrived}
          data-busy={phase === "saving"}
          data-onboard="arrive-button"
          disabled={phase === "saving"}
          aria-pressed={arrived}
          aria-label={arrived ? `Undo arrival for ${row.name}` : `Mark ${row.name} arrived`}
          onClick={() => void write(!arrived)}
        >
          <span className={styles.tick} aria-hidden="true">
            {arrived ? <Check size={18} strokeWidth={3} /> : null}
          </span>
          <span className={styles.body}>
            <b className={styles.name}>{row.name}</b>
            <span className={styles.meta}>
              {arrived
                ? arrival
                  ? `Arrived ${arrival}`
                  : "Arrived"
                : "Expected at the tee"}
            </span>
          </span>
          <span className={styles.state}>
            {phase === "saving" ? "Saving…" : arrived ? "Undo" : "Arrive"}
          </span>
        </button>
        <button
          type="button"
          className={styles.info}
          aria-label={`Details for ${row.name}`}
          onClick={onDetails}
        >
          <Info size={20} aria-hidden="true" />
        </button>
      </div>
      {phase === "error" && (
        <p className={styles.rowError} role="alert">
          <span>Not saved. {error}</span>
          <button
            type="button"
            className={styles.retry}
            onClick={() => void write(failedTarget)}
          >
            Retry
          </button>
        </p>
      )}
    </li>
  );
}
