import { describe, expect, it } from "vitest";
import type { WorkspaceEnv } from "./env";
import { demoMode, opsEnabled } from "./flags";

const dev: WorkspaceEnv = { NODE_ENV: "development" };

describe("opsEnabled", () => {
  it("is on for exactly 1", () => {
    expect(opsEnabled({ ...dev, OPS_ENABLED: "1" })).toBe(true);
  });

  it.each([[""], ["0"], ["true"], ["yes"], [" 1 "]])("is off for %j", (value) => {
    expect(opsEnabled({ ...dev, OPS_ENABLED: value })).toBe(false);
  });

  it("is off when the variable is unset", () => {
    expect(opsEnabled(dev)).toBe(false);
  });
});

describe("demoMode", () => {
  const demo: WorkspaceEnv = { ...dev, OPS_DEMO: "1" };

  it("is on for a development build with OPS_DEMO=1 and no Supabase URL", () => {
    expect(demoMode(demo)).toBe(true);
  });

  it("treats a blank Supabase URL as unset", () => {
    expect(demoMode({ ...demo, NEXT_PUBLIC_SUPABASE_URL: "  " })).toBe(true);
  });

  it("is off when OPS_DEMO is anything other than 1", () => {
    expect(demoMode({ ...demo, OPS_DEMO: "0" })).toBe(false);
    expect(demoMode({ ...demo, OPS_DEMO: "true" })).toBe(false);
    expect(demoMode(dev)).toBe(false);
  });

  it("is off in a production build even when OPS_DEMO=1", () => {
    expect(demoMode({ ...demo, NODE_ENV: "production" })).toBe(false);
  });

  it("is off when a Supabase URL is configured", () => {
    expect(demoMode({ ...demo, NEXT_PUBLIC_SUPABASE_URL: "https://example.test" })).toBe(false);
  });
});
