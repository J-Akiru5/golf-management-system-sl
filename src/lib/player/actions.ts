"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { claimCode, claimSucceeded } from "./claim";

/** The date input posts ISO dates; anything else is refused before it reaches the database. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Links the signed-in account to one member record.
 *
 * A name is public, so it is no longer a factor. The account has to prove it belongs to the person
 * on the record: the NGAP number together with the birthdate on that record, or the email on this
 * account when the club holds that email. The database owns the match, the club scope and the
 * free-record check; this action only carries the answer back as a code, so no database message is
 * ever rendered raw.
 */
export async function claimPlayerRecord(formData: FormData): Promise<void> {
  const ngapId = String(formData.get("ngapId") ?? "").trim();
  const birthdate = String(formData.get("birthdate") ?? "").trim();

  // One without the other proves nothing. Both empty is allowed: that is the email route.
  if ((ngapId === "") !== (birthdate === "")) redirect("/my?claim=invalid");
  if (birthdate !== "" && !ISO_DATE.test(birthdate)) redirect("/my?claim=invalid");
  if (ngapId.length > 40) redirect("/my?claim=invalid");

  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("claim_player_record", {
    p_ngap_id: ngapId === "" ? null : ngapId,
    p_birthdate: birthdate === "" ? null : birthdate,
  });

  if (error) {
    const missing = error.code === "PGRST202" || /could not find the function/i.test(error.message);
    redirect(`/my?claim=${missing ? "not_ready" : "failed"}`);
  }

  if (claimSucceeded(data)) redirect("/my?claim=linked");
  redirect(`/my?claim=${claimCode(data)}`);
}
