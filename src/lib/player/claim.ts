/**
 * The claim step: a signed-in account showing it is the person on a member record.
 *
 * The matching itself lives in the database (`claim_player_record`), because that is where the data
 * and the RLS are, and it mirrors `submit_registration`: NGAP id first, then an unambiguous exact
 * name. This module holds the wording and the input check, so the page stays a template.
 */

export interface ClaimInput {
  name: string;
  ngapId: string;
}

export interface ClaimValidation {
  ok: boolean;
  message?: string;
}

/** The account must give something to match on: a name, an NGAP number, or both. */
export function validateClaimInput(input: ClaimInput): ClaimValidation {
  const name = input.name.trim();
  const ngapId = input.ngapId.trim();

  if (name === "" && ngapId === "") {
    return { ok: false, message: "Enter your full name, or your NGAP number." };
  }
  if (name.length > 120 || ngapId.length > 40) {
    return {
      ok: false,
      message: "That is longer than the club's records hold. Check it and try again.",
    };
  }
  return { ok: true };
}

const MESSAGES: Record<string, string> = {
  invalid: "Enter your full name, or your NGAP number.",
  ambiguous:
    "More than one member record matches that. Add your NGAP number so the club can tell them apart.",
  no_match:
    "No member record matches those details. Ask the club to add you, or enter through the event link.",
  taken: "That member record is already linked to another account. Ask the club to check it.",
  signed_out: "Your session has ended. Sign in again.",
  already_linked: "Your member record is already linked to this account.",
};

/** The code the database returned, in the club's words. Unknown codes say nothing rather than guess. */
export function claimMessage(code: string): string | null {
  return MESSAGES[code] ?? null;
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
