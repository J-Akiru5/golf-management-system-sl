import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // `next dev` otherwise appends an auto-generated agent-rules block to AGENTS.md on every run.
  agentRules: false,
  async headers() {
    // Internal only. Nothing here should be indexed in any environment.
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default config;
