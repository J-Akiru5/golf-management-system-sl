import { describe, expect, it } from "vitest";
import {
  GITHUB_REPOSITORY,
  githubConfig,
  githubConnection,
  githubRepository,
  githubToken,
  githubWebhookSecret,
} from "./config";

const BOTH = { GITHUB_TOKEN: "ghp_example", GITHUB_WEBHOOK_SECRET: "secret" };

describe("the GitHub settings", () => {
  it("returns both values when both are set", () => {
    expect(githubConfig(BOTH)).toEqual({
      token: "ghp_example",
      webhookSecret: "secret",
      repository: GITHUB_REPOSITORY,
    });
  });

  it("is null when either is missing, and says which one", () => {
    expect(githubConfig({ GITHUB_TOKEN: "ghp_example" })).toBeNull();
    expect(githubConfig({ GITHUB_WEBHOOK_SECRET: "secret" })).toBeNull();
    expect(githubConfig({})).toBeNull();

    expect(githubConnection({ GITHUB_TOKEN: "ghp_example" })).toEqual({
      repository: GITHUB_REPOSITORY,
      token: true,
      webhookSecret: false,
      ready: false,
      missing: ["GITHUB_WEBHOOK_SECRET"],
    });
    expect(githubConnection({}).missing).toEqual(["GITHUB_TOKEN", "GITHUB_WEBHOOK_SECRET"]);
  });

  it("reports presence only, never a value, a prefix or a length", () => {
    const connection = githubConnection(BOTH);
    expect(connection.ready).toBe(true);
    const shown = JSON.stringify(connection);
    expect(shown).not.toContain("ghp_example");
    expect(shown).not.toContain("secret");
  });

  it("treats a blank value as missing", () => {
    expect(githubConnection({ GITHUB_TOKEN: "  ", GITHUB_WEBHOOK_SECRET: "\n" }).missing).toEqual([
      "GITHUB_TOKEN",
      "GITHUB_WEBHOOK_SECRET",
    ]);
    expect(githubToken({ GITHUB_TOKEN: "  " })).toBeNull();
    expect(githubWebhookSecret({ GITHUB_WEBHOOK_SECRET: " " })).toBeNull();
  });

  it("takes a well-shaped repository override and ignores a malformed one", () => {
    expect(githubRepository({ GITHUB_REPOSITORY: "J-Akiru5/another-repo" })).toBe(
      "J-Akiru5/another-repo",
    );
    expect(githubRepository({ GITHUB_REPOSITORY: "not a repository" })).toBe(GITHUB_REPOSITORY);
    expect(githubRepository({ GITHUB_REPOSITORY: "owner/" })).toBe(GITHUB_REPOSITORY);
  });
});
