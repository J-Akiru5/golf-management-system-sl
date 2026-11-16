// Local-only QA: run the dev server in demo mode (no Supabase) so the desk renders without sign-in.
process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
process.argv = [process.argv[0], "next", "dev", "-p", "3011"];
require("next/dist/bin/next");
