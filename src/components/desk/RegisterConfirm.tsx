"use client";

import { BadgeCheck, CircleCheck, Copy, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { useId } from "react";
import { Avatar, StatusPill } from "@/components/bits";
import { fmtHcp, fmtIndex, photoOf } from "@/lib/format";
import { cn } from "@/lib/ui/cn";
import {
  eligibilityView,
  missingRequiredFields,
  PAYMENT_OPTIONS,
  paymentLabel,
  persistenceNote,
} from "./logic";
import type {
  EligibilityView,
  PaymentStatus,
  PlayerPickItem,
  RegistrationField,
  RegistrationStatus,
} from "./types";

export interface RegisterConfirmProps {
  /** The event the entry belongs to. Plain strings: the assembler formats them once. */
  event: {
    name: string;
    dateLabel: string;
    cutOffLabel: string;
    formatLabel?: string | null;
    /** E.g. the sample-name or Day 4 tee-time warning. Shown as a note, never hidden. */
    needsConfirmationNote?: string | null;
  };
  /** The player being registered. */
  participant: {
    item: PlayerPickItem;
    role: "member" | "guest";
    onRoleChange?: (role: "member" | "guest") => void;
  };
  /** The routing facts to show; the assembler computes them (frozen index, category, tee, flight). */
  routing: {
    categoryName: string | null;
    teeName: string | null;
    flightName: string | null;
    playingHandicap: number | null;
    index: number | null;
    /** E.g. "NGAP record dated 2026-10-15, frozen at the cut-off". */
    indexNote?: string | null;
    /** E.g. "preview only: tee ratings are sample data". */
    previewLabel?: string | null;
  };
  eligibility: {
    status: RegistrationStatus;
    reasons?: string[];
    maxIndex?: number | null;
  };
  /** A matching entry already in the event. `blocking` stops the save. */
  duplicate?: { name: string; detail?: string | null; blocking?: boolean } | null;
  /** Event questions that still need an answer for this role. Only these are rendered. */
  missingFields: RegistrationField[];
  fieldValues?: Record<string, string>;
  onFieldChange?: (fieldId: string, value: string) => void;
  paymentStatus: PaymentStatus;
  onPaymentStatusChange: (status: PaymentStatus) => void;
  /** The bank instruction from the event, shown with the payment choice when provided. */
  paymentNote?: string | null;
  /** Where the save goes, so the copy is honest. Default: neutral. */
  saveTarget?: "session" | "database" | null;
  /** Full override of the save wording. */
  persistenceNoteOverride?: string | null;
  onConfirm: () => void;
  onCancel?: () => void;
  saving?: boolean;
  confirmLabel?: string;
  className?: string;
}

const TONE_ICON = {
  ok: CircleCheck,
  warn: TriangleAlert,
  bad: OctagonAlert,
} as const;

const TONE_TEXT = {
  ok: "text-success",
  warn: "text-warning",
  bad: "text-danger",
} as const;

const TONE_NOTICE = {
  ok: "ok",
  warn: "warn",
  bad: "bad",
} as const;

/**
 * The confirm step of the registration desk: search, select, then check the facts before saving.
 * It shows the event, the player, the computed category/tee/flight/playing handicap, the
 * eligibility result with its reason, a duplicate warning, the payment choice, and only the event
 * questions that are still unanswered. It says plainly what pressing save will and will not do.
 *
 * The component holds no state of its own: the assembler owns the values and calls
 * `RegistrationRepository.add(tournamentId, input)` with a `NewEntryInput` built from them.
 */
export function RegisterConfirm({
  event,
  participant,
  routing,
  eligibility,
  duplicate,
  missingFields,
  fieldValues = {},
  onFieldChange,
  paymentStatus,
  onPaymentStatusChange,
  paymentNote,
  saveTarget = null,
  persistenceNoteOverride,
  onConfirm,
  onCancel,
  saving = false,
  confirmLabel = "Save registration",
  className,
}: RegisterConfirmProps) {
  const player = participant.item.player;
  const view: EligibilityView = eligibilityView({
    status: eligibility.status,
    reasons: eligibility.reasons,
    index: routing.index,
    maxIndex: eligibility.maxIndex,
  });
  const stillMissing = missingRequiredFields(missingFields, fieldValues, participant.role);
  const blocked = view.blocked || duplicate?.blocking === true;
  const canSave = !blocked && !saving && stillMissing.length === 0;
  const ToneIcon = TONE_ICON[view.tone];
  // Radio names are scoped to this instance so two confirms on one screen never share a group.
  const baseId = useId();

  const facts: { label: string; value: string; note?: string | null }[] = [
    { label: "Index", value: fmtIndex(routing.index), note: routing.indexNote },
    { label: "Category", value: routing.categoryName ?? "Not classified yet" },
    { label: "Tee", value: routing.teeName ?? "Not mapped yet" },
    { label: "Flight", value: routing.flightName ?? "No flight yet" },
    { label: "Playing handicap", value: fmtHcp(routing.playingHandicap) },
  ];

  return (
    <section className={cn("card grid gap-5 sm:p-5", className)} aria-labelledby="confirm-h">
      <header className="grid gap-2">
        <p className="overline">Confirm registration</p>
        <h2 id="confirm-h" className="text-[20px] leading-7">
          {player.name}
        </h2>
        <p className="hint">
          {event.name} · {event.dateLabel} · {event.cutOffLabel}
          {event.formatLabel ? ` · ${event.formatLabel}` : ""}
        </p>
        {event.needsConfirmationNote && (
          <p className="notice warn flex items-start gap-2.5 text-[13px]" role="note">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>{event.needsConfirmationNote}</span>
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-surface-sunken p-3">
        <Avatar name={player.name} photo={photoOf(player)} />
        <div className="min-w-0 flex-1">
          <b className="block truncate">{player.name}</b>
          <span className="hint block truncate">
            {player.ngapId ? `NGAP ${player.ngapId}` : "No NGAP ID on file"}
            {player.homeCourse ? ` · ${player.homeCourse}` : ""}
          </span>
        </div>
        {participant.onRoleChange ? (
          <div className="flex gap-2" role="radiogroup" aria-label="Participant type">
            {(["member", "guest"] as const).map((role) => (
              <button
                key={role}
                type="button"
                role="radio"
                aria-checked={participant.role === role}
                onClick={() => participant.onRoleChange?.(role)}
                className={cn(
                  "h-11 min-w-28 rounded-[10px] border px-4 font-semibold capitalize",
                  participant.role === role
                    ? "border-fairway bg-fairway-soft text-ink"
                    : "border-line-strong bg-surface-raised hover:bg-surface-sunken",
                )}
              >
                {role}
              </button>
            ))}
          </div>
        ) : (
          <span className="pill capitalize">{participant.role}</span>
        )}
      </div>

      <div className="grid gap-2">
        <h3 className="small-h">Where they land</h3>
        <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line sm:grid-cols-5">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="grid content-start gap-0.5 bg-surface-raised px-3 py-2.5"
            >
              <dt className="text-[10.5px] leading-4 font-semibold tracking-[.08em] text-ink-muted uppercase">
                {fact.label}
              </dt>
              <dd className="m-0 font-semibold tnum">{fact.value}</dd>
              {fact.note && <dd className="hint m-0 !text-[11.5px]">{fact.note}</dd>}
            </div>
          ))}
        </dl>
        {routing.previewLabel && <p className="hint">{routing.previewLabel}</p>}
      </div>

      <div
        className={cn("notice flex items-start gap-2.5", TONE_NOTICE[view.tone])}
        role={view.blocked ? "alert" : "status"}
      >
        <ToneIcon
          className={cn("mt-0.5 size-4 shrink-0", TONE_TEXT[view.tone])}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
            <StatusPill status={view.status} />
            {view.blocked ? "Blocked: cannot save as ready" : null}
          </p>
          <p className="text-[13px]">{view.message}</p>
        </div>
      </div>

      {duplicate && (
        <div className="notice warn flex items-start gap-2.5" role="alert">
          <Copy className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span className="text-[13px]">
            <b>{duplicate.name} is already in this event.</b>{" "}
            {duplicate.detail ??
              "Adding them again would create a second entry with its own group and start."}
            {duplicate.blocking ? " Remove the existing entry first." : null}
          </span>
        </div>
      )}

      <div className="grid gap-3">
        <h3 className="small-h">
          {stillMissing.length > 0
            ? `Still needed (${stillMissing.length})`
            : "Event questions answered"}
        </h3>
        {stillMissing.length === 0 && (
          <p className="flex items-center gap-2 text-[13px] text-success">
            <CircleCheck className="size-4" aria-hidden="true" />
            Every required question for this role has an answer.
          </p>
        )}
        {stillMissing.map((field) => (
          <label key={field.id} className="field">
            <span>
              {field.label} <span className="text-danger">*</span>
            </span>
            {field.type === "select" && (
              <select
                value={fieldValues[field.id] ?? ""}
                onChange={(event) => onFieldChange?.(field.id, event.target.value)}
                required
              >
                <option value="">Choose one</option>
                {field.options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            )}
            {field.type === "checkbox" && (
              <span className="flex gap-4 py-1">
                {(["yes", "no"] as const).map((answer) => (
                  <label key={answer} className="check text-[14px]">
                    <input
                      type="radio"
                      name={`${baseId}-field-${field.id}`}
                      value={answer}
                      checked={fieldValues[field.id] === answer}
                      onChange={() => onFieldChange?.(field.id, answer)}
                    />
                    <span className="capitalize">{answer}</span>
                  </label>
                ))}
              </span>
            )}
            {field.type !== "select" && field.type !== "checkbox" && (
              <input
                type={field.type === "number" ? "number" : "text"}
                value={fieldValues[field.id] ?? ""}
                onChange={(event) => onFieldChange?.(field.id, event.target.value)}
                required
              />
            )}
            {field.help && <span className="hint">{field.help}</span>}
          </label>
        ))}
      </div>

      <fieldset className="grid gap-2">
        <legend className="small-h mb-2">Payment status (recorded by hand)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PAYMENT_OPTIONS.map((status) => (
            <label key={status} className="check min-h-11 text-[14px]">
              <input
                type="radio"
                name={`${baseId}-payment-status`}
                checked={paymentStatus === status}
                onChange={() => onPaymentStatusChange(status)}
              />
              <span>{paymentLabel(status)}</span>
            </label>
          ))}
        </div>
        <p className="hint">
          {paymentNote ??
            "TeeLine does not take, check or verify payments. Bank details are shown to the desk only."}
        </p>
      </fieldset>

      <p className="notice flex items-start gap-2.5 !py-2.5 text-[13px]" role="note">
        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
        <span>{persistenceNote(saveTarget, persistenceNoteOverride)}</span>
      </p>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>
            Back
          </button>
        )}
        <button
          type="button"
          className="btn"
          data-help="register-review"
          onClick={onConfirm}
          disabled={!canSave}
        >
          <BadgeCheck aria-hidden="true" />
          {saving ? "Saving…" : confirmLabel}
        </button>
      </div>
      {!canSave && !saving && (
        <p className="hint" role="status">
          {blocked
            ? "Fix the block above before saving."
            : stillMissing.length > 0
              ? "Answer the required questions above to save this entry."
              : null}
        </p>
      )}
    </section>
  );
}
