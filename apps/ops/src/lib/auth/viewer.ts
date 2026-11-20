import type { User } from "@supabase/supabase-js";
import type { WorkspaceMemberRow } from "@/lib/db/types";
import { getServerSupabase } from "@/lib/supabase/server";

export type Viewer = {
  user: User;
  /** Their workspace_members row, or null when they are signed in but not a member. */
  member: WorkspaceMemberRow | null;
};

/**
 * Who is asking. Null means no session at all.
 *
 * A signed-in account with no workspace_members row comes back with `member: null`, so the gate can
 * tell "not signed in" from "signed in and not a member" and answer differently.
 */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await getServerSupabase();

  const { data, error } = await supabase.auth.getUser();
  const user = error ? null : data.user;
  if (!user) return null;

  const { data: member, error: memberError } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // A failed read is not "no row": report it rather than quietly showing the no-access page.
  if (memberError)
    throw new Error(`Could not read the workspace member row: ${memberError.message}`);

  return { user, member: member ?? null };
}
