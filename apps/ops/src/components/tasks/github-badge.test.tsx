// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskGithubLink } from "@/lib/github/types";
import { GithubBadge } from "./github-badge";

const LINK: TaskGithubLink = {
  issueNumber: 350,
  url: "https://github.com/J-Akiru5/golf-management-system-sl/issues/350",
  state: "open",
  labels: ["ops", "workspace", "sync"],
  milestone: "v1.0.0",
  assignees: ["karlcalimotan"],
  githubUpdatedAt: "2026-11-21T09:00:00Z",
  syncedAt: "2026-11-21T09:05:00Z",
};

afterEach(cleanup);

describe("the GitHub badge", () => {
  it("shows the issue number, every label and the milestone", () => {
    render(<GithubBadge link={LINK} />);

    expect(screen.getByRole("link", { name: /GitHub issue 350/ })).toBeTruthy();
    for (const label of LINK.labels) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("v1.0.0")).toBeTruthy();
  });

  it("links to the issue in a new tab without handing over the opener", () => {
    render(<GithubBadge link={LINK} />);
    const link = screen.getByRole("link", { name: /GitHub issue 350/ });
    expect(link.getAttribute("href")).toBe(LINK.url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("marks a closed issue in words, not only in colour", () => {
    render(<GithubBadge link={{ ...LINK, state: "closed" }} />);
    expect(screen.getByRole("link", { name: /closed/ })).toBeTruthy();
    expect(screen.getByText("closed")).toBeTruthy();
  });

  it("keeps a board card short and counts the rest", () => {
    render(<GithubBadge link={LINK} compact />);
    expect(screen.getByText("ops")).toBeTruthy();
    expect(screen.getByText("workspace")).toBeTruthy();
    expect(screen.queryByText("sync")).toBeNull();
    expect(screen.getByLabelText("1 more labels")).toBeTruthy();
  });

  it("is not a link when GitHub gave no page address", () => {
    render(<GithubBadge link={{ ...LINK, url: null }} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("#350")).toBeTruthy();
  });
});
