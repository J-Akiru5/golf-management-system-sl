import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("missing env");
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: tournaments, error: te } = await db.from("tournaments").select("*");
if (te) throw te;
console.log("tournaments", tournaments.length);
for (const t of tournaments) console.log(t);

for (const t of tournaments) {
  const [{ count: regs }, { count: groups }, { count: notes }] = await Promise.all([
    db.from("registrations").select("*", { count: "exact", head: true }).eq("tournament_id", t.id),
    db.from("groups").select("*", { count: "exact", head: true }).eq("tournament_id", t.id),
    db.from("notifications").select("*", { count: "exact", head: true }).eq("tournament_id", t.id),
  ]);
  console.log("counts", t.name, { regs, groups, notes });
}

const { data: notes, error: ne } = await db
  .from("notifications")
  .select("id, tournament_id, club_id, kind, subject, severity, title, resolved_at, created_at")
  .order("created_at", { ascending: false })
  .limit(20);
if (ne) throw ne;
console.log("notifications", notes);

const { data: regs, error: re } = await db
  .from("registrations")
  .select("id, tournament_id, player_id, status, created_at")
  .order("created_at", { ascending: false })
  .limit(10);
if (re) throw re;
console.log("recent registrations", regs);
