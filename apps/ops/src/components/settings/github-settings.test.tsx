// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GithubConnection, GithubSyncLogRow, GithubUserMapRow } from "@/lib/github/types";
import { GithubSettings } from "./github-settings";

const READY: GithubConnection = {
  repository: "J-Akiru5/golf-management-system-sl",
  token: true,
  webhookSecret: true,
  ready: true,
  missing: [],
};

const MISSING: GithubConnection = {
  repository: "J-Akiru5/golf-management-system-sl",
  token: true,
  webhookSecret: false,
  ready: false,
  missing: ["GITHUB_WEBHOOK_SECRET"],
};

const MAPPINGS: GithubUserMapRow[] = [
  { login: "karlcalimotan", memberId: "member-karl", memberName: "Karl C." },
  { login: "dev-lou", memberId: "member-lou", memberName: "Lou D." },
];

const LOG: GithubSyncLogRow[] = [
  {
    id: "2",
    taskId: "task-1",
    issueNumber: 350,
    direction: "inbound",
    outcome: "applied",
    detail: "GitHub change applied",
    createdAt: "2026-11-21T01:00:00Z",
  },
  {
    id: "1",
    taskId: "task-1",
    issueNumber: 350,
    direction: "outbound",
    outcome: "error",
    detail: "GITHUB_TOKEN is not set on this deployment, so the change was not pushed.",
    createdAt: "2026-11-21T00:00:00Z",
  },
];

function renderSettings(connection: GithubConnection = READY) {
  const actions = {
    importIssues: vi.fn(async () => ({ ok: true as const, message: "Imported." })),
    saveMapping: vi.fn(async () => ({ ok: true as const, message: "Saved." })),
    removeMapping: vi.fn(async () => ({ ok: true as const, message: "Removed." })),
  };
  render(
    <GithubSettings
      connection={connection}
      mappings={MAPPINGS}
      log={LOG}
      members={[{ id: "member-karl", displayName: "Karl C." }]}
      unavailable={null}
      actions={actions}
    />,
  );
  return actions;
}

afterEach(cleanup);

describe("the GitHub settings section", () => {
  it("says a missing setting is missing and names it, without showing a value", () => {
    renderSettings(MISSING);
    expect(screen.getByText("Missing")).toBeTruthy();
    expect(screen.getAllByText("Present")).toHaveLength(1);
    expect(screen.getByText(/Set GITHUB_WEBHOOK_SECRET/)).toBeTruthy();
    expect(screen.queryByText(/ghp_/)).toBeNull();
  });

  it("disables the import until both settings are present", () => {
    renderSettings(MISSING);
    expect(
      (screen.getByRole("button", { name: "Import open issues now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("lists the mappings with a labelled remove for each", () => {
    renderSettings();
    expect(screen.getByText("karlcalimotan")).toBeTruthy();
    expect(screen.getAllByText("Karl C.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Remove the mapping for dev-lou" })).toBeTruthy();
  });

  it("shows the recent sync attempts with a plain outcome and direction", () => {
    renderSettings();
    expect(screen.getByText("Applied")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("From GitHub")).toBeTruthy();
    expect(screen.getByText("To GitHub")).toBeTruthy();
    expect(screen.getAllByText("#350")).toHaveLength(2);
  });

  it("tells the owner when the tables cannot be read", () => {
    render(
      <GithubSettings
        connection={READY}
        mappings={[]}
        log={[]}
        members={[]}
        unavailable="The GitHub tables could not be read. Apply docs/github-sync/apply-on-live.sql, then reload this page."
        actions={{
          importIssues: vi.fn(async () => ({ ok: true as const, message: "Imported." })),
          saveMapping: vi.fn(async () => ({ ok: true as const, message: "Saved." })),
          removeMapping: vi.fn(async () => ({ ok: true as const, message: "Removed." })),
        }}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("apply-on-live.sql");
    expect(
      (screen.getByRole("button", { name: "Import open issues now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
