import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

// The version a tester writes on the acceptance form comes from here, so it can never drift from
// package.json. The commit is present on Git-connected Vercel builds and absent on a hand deploy.
const { version } = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  version: string;
};

const config: NextConfig = {
  reactStrictMode: true,
  // `next dev` otherwise appends an auto-generated agent-rules block to AGENTS.md on every run,
  // which lands in `git status` and gets committed by accident. The repo keeps its own AGENTS.md.
  agentRules: false,
  // Only the production deployment may be indexed. The develop branch deploys on every merge and
  // preview URLs exist, and neither may compete with the real site in a search index. Vercel sets
  // VERCEL_ENV at build time; a local build has no value, so it is treated as non-production too.
  async headers() {
    if (process.env.VERCEL_ENV === "production") return [];
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_APP_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
    NEXT_PUBLIC_APP_BUILT: new Date().toISOString().slice(0, 10),
  },
};

export default config;
