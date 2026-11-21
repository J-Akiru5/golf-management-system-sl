import { describe, expect, it } from "vitest";
import { isPullRequest, issueFromEvent, parseGithubIssue } from "./issue";

/** The shape GitHub's REST API and the `issues` webhook event both use. */
const RAW = {
  number: 350,
  title: "Two-way GitHub sync",
  body: "Issues for dev should show in the ops portal.",
  state: "open",
  html_url: "https://github.com/J-Akiru5/golf-management-system-sl/issues/350",
  url: "https://api.github.com/repos/J-Akiru5/golf-management-system-sl/issues/350",
  updated_at: "2026-11-21T09:00:00Z",
  labels: [{ name: "ops" }, { name: "workspace" }],
  milestone: { title: "v1.0.0" },
  assignees: [{ login: "Karlcalimotan" }, { login: "dev-lou" }],
};

describe("reading an issue", () => {
  it("reads the fields the sync stores", () => {
    expect(parseGithubIssue(RAW)).toEqual({
      number: 350,
      title: "Two-way GitHub sync",
      body: "Issues for dev should show in the ops portal.",
      state: "open",
      url: "https://github.com/J-Akiru5/golf-management-system-sl/issues/350",
      updatedAt: "2026-11-21T09:00:00Z",
      labels: ["ops", "workspace"],
      milestone: "v1.0.0",
      assignees: ["Karlcalimotan", "dev-lou"],
    });
  });

  it("keeps the login's case and drops a duplicate that differs only in case", () => {
    const issue = parseGithubIssue({
      ...RAW,
      assignees: [{ login: "dev-lou" }, { login: "DEV-LOU" }],
    });
    expect(issue?.assignees).toEqual(["dev-lou"]);
  });

  it("reads an issue with no body, no labels, no milestone and no assignees", () => {
    const issue = parseGithubIssue({
      ...RAW,
      body: null,
      labels: [],
      milestone: null,
      assignees: [],
    });
    expect(issue).toMatchObject({ body: null, labels: [], milestone: null, assignees: [] });
  });

  it("refuses an issue whose number, title, state, timestamp or url cannot be trusted", () => {
    expect(parseGithubIssue({ ...RAW, number: 0 })).toBeNull();
    expect(parseGithubIssue({ ...RAW, number: "350" })).toBeNull();
    expect(parseGithubIssue({ ...RAW, title: "   " })).toBeNull();
    expect(parseGithubIssue({ ...RAW, state: "merged" })).toBeNull();
    expect(parseGithubIssue({ ...RAW, updated_at: "yesterday" })).toBeNull();
    expect(parseGithubIssue({ ...RAW, html_url: "", url: "" })).toBeNull();
    expect(parseGithubIssue(null)).toBeNull();
    expect(parseGithubIssue([])).toBeNull();
  });

  it("reads the issue out of a webhook delivery", () => {
    expect(issueFromEvent({ action: "opened", issue: RAW })?.number).toBe(350);
    expect(issueFromEvent({ action: "opened" })).toBeNull();
    expect(issueFromEvent("nope")).toBeNull();
  });

  it("recognises the pull request a list of issues also contains", () => {
    expect(isPullRequest({ ...RAW, pull_request: { url: "..." } })).toBe(true);
    expect(isPullRequest(RAW)).toBe(false);
    expect(isPullRequest(null)).toBe(false);
  });
});
