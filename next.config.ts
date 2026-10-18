import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // `next dev` otherwise appends an auto-generated agent-rules block to AGENTS.md on every run,
  // which lands in `git status` and gets committed by accident. The repo keeps its own AGENTS.md.
  agentRules: false,
};

export default config;
