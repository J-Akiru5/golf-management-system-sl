import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

for (const table of [
  "clubs",
  "club_members",
  "players",
  "registrations",
  "groups",
  "group_members",
  "notifications",
  "notification_reads",
]) {
  const { data, error, count } = await db.from(table).select("*", { count: "exact" }).limit(3);
  console.log(`\n== ${table} (${count ?? "?"}) ==`);
  if (error) console.log("error", error.message);
  else console.log(data);
}

const { data: users, error: ue } = await db.auth.admin.listUsers({ perPage: 20 });
console.log("\n== auth users ==", ue?.message ?? "");
console.log(
  users?.users.map((u) => ({ id: u.id, email: u.email, last: u.last_sign_in_at })),
);
