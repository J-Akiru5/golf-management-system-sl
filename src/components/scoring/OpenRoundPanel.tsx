"use client";

import { ClipboardCheck, RotateCcw } from "lucide-react";
import { useState } from "react";
import { RoleGate } from "@/components/desk/RoleGate";
import type { DeskRole } from "@/components/desk/types";
import { SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  assessOpenRound,
  type OpenRoundSettingKey,
  type OpenRoundSettings,
  type OpenRoundSnapshot,
  type TieBreakPolicyOption,
} from "@/lib/data/open-round";
import type { OpenRoundInput } from "@/lib/data/scoring";
import type { FinalizationAuthority } from "@/lib/scoring";

function parseCards(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAuthority(value: string): FinalizationAuthority | null {
  if (value === "owner" || value === "organizer") return value;
  return null;
}

/**
 * Round setup: the four settings the round needs, the readiness check and the Open action.
 *
 * The panel only proposes values. `assessOpenRound` decides whether the round can be opened and
 * says what is missing, so the screen and the database refuse for the same reasons.
 */
export function OpenRoundPanel({
  snapshot,
  role,
  busy,
  onOpen,
  onReload,
}: {
  snapshot: OpenRoundSnapshot;
  role?: DeskRole | null;
  busy: boolean;
  onOpen: (input: OpenRoundInput) => Promise<void>;
  onReload: () => void;
}) {
  const stored = snapshot.storedSettings;
  const [requiredCards, setRequiredCards] = useState(
    stored.requiredCards === null ? "" : String(stored.requiredCards),
  );
  const [authority, setAuthority] = useState(stored.finalizationAuthority ?? "");
  const [tieBreakId, setTieBreakId] = useState(stored.tieBreakPolicyId ?? "");
  const [rulesVersion, setRulesVersion] = useState(stored.rulesVersion ?? "");

  const proposed: OpenRoundSettings = {
    requiredCards: parseCards(requiredCards),
    finalizationAuthority: parseAuthority(authority),
    tieBreakPolicyId: tieBreakId === "" ? null : tieBreakId,
    rulesVersion: rulesVersion.trim() === "" ? null : rulesVersion.trim(),
  };
  const readiness = assessOpenRound(snapshot, proposed, snapshot.draw.revision);
  const mayAct = role === undefined || role === "owner" || role === "organizer";
  const fieldsDisabled = busy || readiness.state === "already_open" || !mayAct;
  const missing: readonly OpenRoundSettingKey[] =
    readiness.state === "missing_settings" ? readiness.missing : [];
  // A policy with no confirmation cannot open the round, so an unconfirmed-only list offers nothing.
  const confirmedPolicies = snapshot.tieBreakPolicies.filter((policy) => policy.confirmed);
  const policyOptions: readonly TieBreakPolicyOption[] =
    confirmedPolicies.length === 0 ? [] : snapshot.tieBreakPolicies;
  const showReload =
    readiness.state === "draw_moved" ||
    readiness.state === "not_published" ||
    readiness.state === "missing_player_ids";

  return (
    <SectionCard
      id="score-round"
      icon={<ClipboardCheck />}
      title="Round setup"
      subtitle="The round is opened from the published draw before the first card is scanned. Nothing is guessed from the pairings."
      dataHelp="scores-round"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span>Required cards per player</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={requiredCards}
            onChange={(event) => setRequiredCards(event.target.value)}
            aria-invalid={missing.includes("requiredCards") ? true : undefined}
            disabled={fieldsDisabled}
          />
        </label>

        <label className="field">
          <span>Final approval authority</span>
          <select
            value={authority}
            onChange={(event) => setAuthority(event.target.value)}
            aria-invalid={missing.includes("finalizationAuthority") ? true : undefined}
            disabled={fieldsDisabled}
          >
            <option value="">Choose the final approval authority</option>
            <option value="owner">Owner</option>
            <option value="organizer">Organizer</option>
          </select>
          <span className="hint">
            Committee approval is not offered because finalization does not support it yet.
          </span>
        </label>

        <label className="field">
          <span>Tie-break policy</span>
          <select
            value={tieBreakId}
            onChange={(event) => setTieBreakId(event.target.value)}
            aria-invalid={missing.includes("tieBreakPolicyId") ? true : undefined}
            disabled={fieldsDisabled || policyOptions.length === 0}
          >
            <option value="">Choose a tie-break policy</option>
            {policyOptions.map((policy) => (
              <option key={policy.id} value={policy.id}>
                {policy.confirmed ? policy.name : `${policy.name} (not confirmed)`}
              </option>
            ))}
          </select>
          {confirmedPolicies.length === 0 ? (
            <span className="hint">
              No confirmed tie-break policy is on file. Record the organizer&apos;s written rule
              first.
            </span>
          ) : (
            <span className="hint">
              A policy marked not confirmed cannot open the round until the organizer&apos;s written
              rule is recorded.
            </span>
          )}
        </label>

        <label className="field">
          <span>Rules version</span>
          <input
            type="text"
            value={rulesVersion}
            onChange={(event) => setRulesVersion(event.target.value)}
            placeholder="Rules edition used for this round"
            aria-invalid={missing.includes("rulesVersion") ? true : undefined}
            disabled={fieldsDisabled}
          />
        </label>
      </div>

      <p className="hint">
        These settings are stored on the round and cannot be changed once scoring starts.
      </p>

      <div
        className={`notice ${
          readiness.state === "ready" ? "ok" : readiness.state === "already_open" ? "info" : "warn"
        }`}
        role="status"
      >
        <p className="m-0 text-[13px]">{readiness.message}</p>
        {showReload && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onReload} disabled={busy}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Reload
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <RoleGate
          role={role}
          allow={["owner", "organizer"]}
          mode="disable"
          disabledReason="Only an owner or organizer can open the round."
        >
          <Button
            variant="gold"
            size="sm"
            data-help="scores-round-open"
            disabled={busy || readiness.state !== "ready"}
            onClick={() => {
              void onOpen({ ...proposed, expectedRevision: snapshot.draw.revision });
            }}
          >
            {busy ? "Opening…" : "Open the round"}
          </Button>
        </RoleGate>
      </div>
    </SectionCard>
  );
}
