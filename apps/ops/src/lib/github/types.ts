/**
 * The GitHub side of the Tasks board (#350). One issue is linked to one task; the issue number is
 * the join. These types are the vocabulary the sync, the screen and the tests share.
 *
 * Nothing here reads the environment or the network.
 */

export type GithubIssueState = "open" | "closed";
export type GithubDirection = "inbound" | "outbound";
export type GithubOutcome = "applied" | "skipped" | "conflict" | "error";

/** What the database answers when an issue is applied. `conflict` means the workspace edit won. */
export type InboundStatus = "created" | "applied" | "skipped" | "conflict";

/** One GitHub issue, as the sync handles it. */
export type GithubIssue = {
  number: number;
  title: string;
  body: string | null;
  state: GithubIssueState;
  labels: string[];
  milestone: string | null;
  assignees: string[];
  /** The human page, not the API URL. */
  url: string;
  updatedAt: string;
};

/** The GitHub fields of a linked task, read from the task row. */
export type TaskGithubLink = {
  issueNumber: number;
  url: string | null;
  state: GithubIssueState | null;
  labels: string[];
  milestone: string | null;
  assignees: string[];
  githubUpdatedAt: string | null;
  syncedAt: string | null;
};

/** A row of github_user_map, joined to the member's display name for the screen. */
export type GithubUserMapRow = {
  login: string;
  memberId: string;
  memberName: string;
};

/** A row of github_sync_log. Never holds a token, a secret or a full issue body. */
export type GithubSyncLogRow = {
  id: string;
  taskId: string | null;
  issueNumber: number | null;
  direction: GithubDirection;
  outcome: GithubOutcome;
  detail: string | null;
  createdAt: string;
};

/**
 * What Settings may say about the deployment. The token and the secret are reported as present or
 * missing and never with a value, a prefix or a length.
 */
export type GithubConnection = {
  repository: string;
  token: boolean;
  webhookSecret: boolean;
  /** True when both are set, so the sync can work. */
  ready: boolean;
  /** The environment variable names that are missing. */
  missing: string[];
};
