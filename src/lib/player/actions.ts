"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { claimCode, claimSucceeded, validateClaimInput } from "./claim";

/**
 * Links the signed-in account to one member record. The database decides whether the details match
 * exactly one record and whether that record is free; this action only carries the answer back to
 * the page as a code, so no database message is ever rendered raw.
 */
export async function claimPlayerRecord(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "");
  const ngapId = String(formData.get("ngapId") ?? "");

  const check = validateClaimInput({ name, ngapId });
  if (!check.ok) redirect("/my?claim=invalid");

  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("claim_player_record", {
    p_name: name.trim() === "" ? null : name.trim(),
    p_ngap_id: ngapId.trim() === "" ? null : ngapId.trim(),
  });

  if (error) {
    const missing = error.code === "PGRST202" || /could not find the function/i.test(error.message);
    redirect(`/my?claim=${missing ? "not_ready" : "failed"}`);
  }

  if (claimSucceeded(data)) redirect("/my?claim=linked");
  redirect(`/my?claim=${claimCode(data)}`);
}
