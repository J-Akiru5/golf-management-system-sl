import { describe, expect, it } from "vitest";
import { createDemoRepos, getRepos } from "./repos";

describe("getRepos", () => {
  it("returns the demo set in demo mode", async () => {
    const repos = await getRepos({ OPS_DEMO: "1", NODE_ENV: "development" });
    expect(Object.keys(repos).sort()).toEqual(["board", "docs", "members", "tasks"]);
    expect(repos).toEqual(createDemoRepos());
  });

  it("fails closed with no Supabase configuration and demo off", async () => {
    await expect(getRepos({ NODE_ENV: "development" })).rejects.toThrow(/no data source/);
  });

  it("never uses demo data in a production build", async () => {
    await expect(getRepos({ OPS_DEMO: "1", NODE_ENV: "production" })).rejects.toThrow(
      /no data source/,
    );
  });
});

describe("createDemoRepos", () => {
  it("has one repository per domain", () => {
    const repos = createDemoRepos();
    for (const repo of Object.values(repos)) expect(repo).toBeTypeOf("object");
  });
});
