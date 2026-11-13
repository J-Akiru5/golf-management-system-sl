import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const remove = process.argv.includes("--remove");

if (!email) {
  console.error(
    "Usage: pnpm scorecard:role -- team@example.com [--remove]\n" +
      "Grants the tabulation role in the user's Supabase app metadata. It does not add a club_members row.",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let page = 1;
let user = null;
for (;;) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) {
    console.error(`Could not list users: ${error.message}`);
    process.exit(1);
  }
  user = data.users.find((entry) => entry.email?.toLowerCase() === email) ?? null;
  if (user || data.users.length < 1000) break;
  page += 1;
}

if (!user) {
  console.error(`No Supabase Auth user has the email ${email}. Create the account first.`);
  process.exit(1);
}

const metadata = { ...(user.app_metadata ?? {}) };
if (remove) {
  delete metadata.scorecard_role;
} else {
  metadata.scorecard_role = "tabulation";
}

const { error } = await supabase.auth.admin.updateUserById(user.id, {
  app_metadata: metadata,
});
if (error) {
  console.error(`Could not update ${email}: ${error.message}`);
  process.exit(1);
}

console.log(`${remove ? "Removed" : "Granted"} tabulation access for ${email}.`);
