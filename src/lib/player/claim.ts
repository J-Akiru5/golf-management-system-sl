/**
 * The claim step: a signed-in account showing it is the person on a member record.
 *
 * The matching itself lives in the database (`claim_player_record`), because that is where the data
 * and the RLS are, and it mirrors `submit_registration`: NGAP id first, then an unambiguous exact
 * name. This module holds the wording and the input check, so the page stays a template.
 */

import type { Translate, TranslationKey } from "@/lib/i18n/t";

export interface ClaimInput {
  name: string;
  ngapId: string;
}

export interface ClaimValidation {
  ok: boolean;
  message?: string;
}

/** The account must give something to match on: a name, an NGAP number, or both. */
export function validateClaimInput(t: Translate, input: ClaimInput): ClaimValidation {
  const name = input.name.trim();
  const ngapId = input.ngapId.trim();

  if (name === "" && ngapId === "") {
    return { ok: false, message: t("player.claim.invalid") };
  }
  if (name.length > 120 || ngapId.length > 40) {
    return { ok: false, message: t("player.claim.tooLong") };
  }
  return { ok: true };
}

const CLAIM_KEYS: Record<string, TranslationKey> = {
  invalid: "player.claim.invalid",
  ambiguous: "player.claim.ambiguous",
  no_match: "player.claim.noMatch",
  taken: "player.claim.taken",
  signed_out: "player.claim.signedOut",
  already_linked: "player.claim.alreadyLinked",
};

/** The code the database returned, in the club's words. Unknown codes say nothing rather than guess. */
export function claimMessage(t: Translate, code: string): string | null {
  const key = CLAIM_KEYS[code];
  return key ? t(key) : null;
}

/** Reads the code out of the jsonb the claim function returns. */
export function claimCode(raw: unknown): string {
  if (typeof raw === "object" && raw !== null && "code" in raw) {
    const code = (raw as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "unknown";
}

export function claimSucceeded(raw: unknown): boolean {
  return (
    typeof raw === "object" && raw !== null && "ok" in raw && (raw as { ok?: unknown }).ok === true
  );
}
