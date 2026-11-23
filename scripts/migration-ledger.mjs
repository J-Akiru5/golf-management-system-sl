#!/usr/bin/env node
/**
 * Read-only migration ledger for the live Supabase project.
 *
 * The deployed app has no database console in the repository, and the `supabase_migrations` schema is
 * not exposed to PostgREST. This script does two things:
 *
 *   1. Compares the local `supabase/migrations/*.sql` versions with the live
 *      `supabase_migrations.schema_migrations` table, when a Supabase personal access token is set.
 *   2. Checks the key tables, columns and data the outstanding scripts create, so the state is known
 *      even when the migrations table is not reachable.
 *
 * It never writes. It never prints a key or a token.
 *
 * Usage, from a checkout with `.env.local`:
 *   pnpm migrations:check
 *   # or, without the package script:
 *   node --env-file=.env.local scripts/migration-ledger.mjs
 *
 * Optional full-table comparison: set SUPABASE_ACCESS_TOKEN (a personal access token) in the
 * environment or `.env.local`. The project ref is read from NEXT_PUBLIC_SUPABASE_URL.
 */

import { readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_ROLE_KEY?.trim();

if (!url || !key) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_ROLE_KEY) first.",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const localFiles = readdirSync("supabase/migrations")
  .filter((name) => name.endsWith(".sql"))
  .sort();
const localVersions = new Map(localFiles.map((name) => [name.slice(0, 14), name]));

/** One object check. `run` returns a Supabase response; no error means the object is present. */
const checks = [
  { label: "0.61 landing: tournaments.landing_featured", run: () => supabase.from("tournaments").select("landing_featured").limit(1) },
  { label: "0.62 public-v2: public_feedback.details", run: () => supabase.from("public_feedback").select("details").limit(1) },
  { label: "0.62 public-v2: chat_rate_events", run: () => supabase.from("chat_rate_events").select("id").limit(1) },
  { label: "0.63 ai-providers: ai_provider_settings", run: () => supabase.from("ai_provider_settings").select("*").limit(1) },
  { label: "0.63 god-mode: god_audit", run: () => supabase.from("god_audit").select("*").limit(1) },
  { label: "0.63 permissions: ws_role_permissions", run: () => supabase.from("ws_role_permissions").select("page").limit(1) },
  { label: "0.60 workspace: workspace_members", run: () => supabase.from("workspace_members").select("user_id").limit(1) },
  { label: "0.64 presets: tournament_presets", run: () => supabase.from("tournament_presets").select("id").limit(1) },
  { label: "0.64 GitHub sync: ws_tasks.github_issue_number", run: () => supabase.from("ws_tasks").select("github_issue_number").limit(1) },
  { label: "0.64 GitHub sync: github_user_map", run: () => supabase.from("github_user_map").select("*").limit(1) },
  { label: "0.64 GitHub sync: github_sync_log", run: () => supabase.from("github_sync_log").select("*").limit(1) },
  { label: "0.64 timeline: ws_role_permissions timeline rows", run: () => supabase.from("ws_role_permissions").select("role").eq("page", "timeline") },
  { label: "0.55 photo token: players.public_photo_token", run: () => supabase.from("players").select("public_photo_token").limit(1) },
  { label: "0.55 scorecard scans: scorecard_scans", run: () => supabase.from("scorecard_scans").select("id").limit(1) },
  { label: "0.55 per-day PM: competition_rounds.pm_first_tee_time", run: () => supabase.from("competition_rounds").select("pm_first_tee_time").limit(1) },
  { label: "0.55 rounds per day: competition_rounds rows", run: () => supabase.from("competition_rounds").select("day_number,status") },
  { label: "0.64 entry limits: registrations.rate_key", run: () => supabase.from("registrations").select("rate_key").limit(1) },
  { label: "0.55 membership backfill: registrations.membership_type", run: () => supabase.from("registrations").select("membership_type").limit(1) },
  { label: "0.53 results reveal: tournaments.publish_views", run: () => supabase.from("tournaments").select("publish_views").limit(1) },
];

async function liveVersionsFromManagementApi() {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) return null;
  const projectRef = new URL(url).host.split(".")[0];
  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "select version from supabase_migrations.schema_migrations order by version",
        }),
      },
    );
    if (!response.ok) {
      console.error(`Management API returned ${response.status}; the migrations table was not read.`);
      return null;
    }
    const body = await response.json();
    const rows = Array.isArray(body) ? body : (body.data ?? body.result ?? []);
    if (!Array.isArray(rows)) return null;
    return rows.map((row) => String(row.version));
  } catch (error) {
    console.error(
      `The migrations table could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

console.log(`Local migrations: ${localFiles.length}`);
console.log("Live state is read-only; nothing is written by this script.");

let liveVersions = null;
try {
  const { data, error } = await supabase
    .schema("supabase_migrations")
    .from("schema_migrations")
    .select("version");
  if (!error && Array.isArray(data)) liveVersions = data.map((row) => String(row.version));
} catch {
  // The schema is not exposed to PostgREST; try the Management API below.
}
if (!liveVersions) liveVersions = await liveVersionsFromManagementApi();

if (liveVersions) {
  console.log(`Live migrations table: ${liveVersions.length} applied`);
  const live = new Set(liveVersions);
  const missing = [...localVersions.entries()].filter(([version]) => !live.has(version));
  if (missing.length > 0) {
    console.log("Local migrations not in the live table:");
    for (const [version, name] of missing) console.log(`  ${version} ${name}`);
  } else {
    console.log("Every local migration is in the live table.");
  }
} else {
  console.log(
    "Live migrations table: not readable. The supabase_migrations schema is not exposed, and no SUPABASE_ACCESS_TOKEN was set.",
  );
  console.log("The object checks below are the evidence until the token is available.");
}

console.log("");
for (const check of checks) {
  const { data, error } = await check.run();
  if (error) {
    console.log(`GAP  ${check.label} — ${error.message}`);
    continue;
  }
  const count = Array.isArray(data) ? data.length : null;
  console.log(`OK   ${check.label}${count !== null ? ` (${count} row${count === 1 ? "" : "s"})` : ""}`);
}

// A paired check for the preset seed, the membership backfill and the timeline rows, because an
// empty value is a gap in the owner's setup even though the table/column exists.
const memberships = await supabase
  .from("registrations")
  .select("membership_type")
  .limit(2000);
if (!memberships.error && Array.isArray(memberships.data)) {
  const empty = memberships.data.filter((row) => !row.membership_type).length;
  if (empty > 0) {
    console.log(
      `NOTE ${empty} registration(s) have no membership_type; run/complete 20261115000900_registration_role_backfill.sql.`,
    );
  }
}
const presets = await supabase.from("tournament_presets").select("id");
if (!presets.error && Array.isArray(presets.data) && presets.data.length === 0) {
  console.log("NOTE tournament_presets exists but has no rows; run seed_preset_from_tournament for the event.");
}
const timeline = await supabase
  .from("ws_role_permissions")
  .select("role")
  .eq("page", "timeline");
if (!timeline.error && Array.isArray(timeline.data) && timeline.data.length === 0) {
  console.log("NOTE ws_role_permissions has no timeline rows; run docs/timeline/apply-on-live.sql.");
}
