# GitHub issues and the workspace Tasks board

The workspace shows the GitHub issues of `J-Akiru5/golf-management-system-sl` on the Tasks board, and
a change made on either side reaches the other. One issue is one task; the issue number is the link.

- **GitHub → workspace.** A webhook, `POST /api/github/webhook`, takes the `issues` event. It creates
  a task for a newly opened issue and updates a linked one for an edit, a close, a reopen, an
  assignment or a label or milestone change. The workspace never reads the GitHub API on a page load.
- **Workspace → GitHub.** Saving a linked task's title, status or assignee calls GitHub once, with
  the fine-grained token. Done writes `closed`; any other column writes `open`.
- **Both at once.** The newer edit wins. An issue event stamped no later than the last sync is an
  echo of our own push and is skipped. When the workspace holds a newer edit, the task keeps it, the
  event's labels and milestone are still recorded, and the workspace title and status are pushed
  back to the issue.

Everything the sync does is written to `github_sync_log`, which the owner reads on Settings. No token,
secret or issue body is ever recorded there.

## What the owner sets up once

### 1. Apply the SQL

Run `docs/github-sync/apply-on-live.sql` in the Supabase SQL editor of the project the golf app and the
workspace share. It is one transaction and additive: eight nullable link columns on `ws_tasks`, the
`github_user_map` and `github_sync_log` tables, four functions and three triggers. The read-only checks
at the bottom should return eight columns and both tables with row level security on.

### 2. Environment variables

Set both on the Vercel project that runs the workspace (`apps/ops`), then redeploy. They are
server-only; never put either behind `NEXT_PUBLIC_`.

| Name | What it is |
| --- | --- |
| `GITHUB_TOKEN` | A fine-grained personal access token for this repository only, with **Issues: Read and write** and nothing else. |
| `GITHUB_WEBHOOK_SECRET` | A random string you also paste into the webhook. It signs every delivery. 32 random bytes as hex is plenty. |

Optional: `GITHUB_REPOSITORY` overrides `J-Akiru5/golf-management-system-sl`. Leave it unset unless the
repository moves; a malformed value is ignored and the default is used.

Generate the secret without a helper that logs it, for example:

```bash
head -c 32 /dev/urandom | xxd -p -c 64
```

### 3. The GitHub token

GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate
new. Repository access: only `J-Akiru5/golf-management-system-sl`. Repository permissions: **Issues —
Read and write**. Everything else: no access. The workspace never needs contents, pull requests or
administration, and it must not be given them.

### 4. The webhook

Repository → Settings → Webhooks → Add webhook.

| Field | Value |
| --- | --- |
| Payload URL | `https://<workspace host>/api/github/webhook` |
| Content type | `application/json` |
| Secret | the value of `GITHUB_WEBHOOK_SECRET` |
| SSL verification | Enable |
| Which events | **Let me select individual events** → **Issues** only |

GitHub sends a `ping` when the webhook is saved; the route answers it with `200` and `{"ok":true,"ping":true}`.
A wrong secret shows as a `401` in Recent Deliveries and nothing is written.

### 5. The people

Settings → GitHub → Who is who on GitHub, map each GitHub login to a workspace member. Map Karl
(`Karlcalimotan`) and Lou (`dev-lou`) so an assignee crosses both ways. A login with no mapping still
shows on the task as a GitHub assignee; it just cannot be turned into a workspace assignee.

### 6. The first load

Settings → GitHub → **Import open issues now**. It reads the open issues in pages of 100, stops at ten
pages or at GitHub's rate limit, and is safe to run again: an issue already linked is updated, not
duplicated.

## What the sync does not do

- It does not create a GitHub issue from a workspace task. A task created in the workspace has no
  issue, so there is nothing to push to.
- It does not delete anything. Deleting a linked task leaves its issue alone. Closing an issue
  completes the task; reopening it returns the task to To do.
- It does not edit labels or the milestone from the workspace. Those are read from GitHub and shown on
  the task; a task has no labels field of its own.
- It does not read the live board or any player data. It only touches `ws_tasks`, `github_user_map`
  and `github_sync_log`.
- It does not run when either setting is missing. The Settings section says which one, the Tasks board
  works as before, and a task save whose push cannot run records the reason in the sync log.

## When something looks wrong

1. Settings → GitHub. The connection rows say whether the token and the secret are present. Recent
   changes names the last twenty attempts and their outcome.
2. GitHub → the repository → Settings → Webhooks → Recent Deliveries. A `401` means the secret does
   not match. A `503` means that variable is missing on the deployment. A `500` is a workspace-side
   failure; the sync log has the reason.
3. A push failing with `403` usually means the token's repository access or its **Issues: Read and
   write** permission is wrong.
4. A conflict is not an error. It means both sides changed the same task; the newer edit won and both
   are recorded.

## Tests

```bash
pnpm --filter @teeline/ops test
```

`apps/ops/src/lib/github/migration.test.ts` applies the migration to an in-process Postgres and checks
the write guard, the echo rule, the conflict rule and the owner-only writes. The other tests in that
folder cover the signature check, the issue mapping both ways, the loop guard and the outbound plan,
with `fetch` mocked. Nothing in the suite calls GitHub or a database.
