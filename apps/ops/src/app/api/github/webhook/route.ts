import { revalidatePath } from "next/cache";
import { createGithubClient } from "@/lib/github/client";
import { githubRepository, githubToken, githubWebhookSecret } from "@/lib/github/config";
import { issueFromEvent } from "@/lib/github/issue";
import { serviceGithubRepo } from "@/lib/github/repo";
import { verifyWebhookSignature } from "@/lib/github/signature";
import { applyInboundIssue } from "@/lib/github/webhook";

/**
 * GitHub -> workspace: the `issues` webhook.
 *
 * The route proves the delivery before it reads anything: the raw body is signed with
 * GITHUB_WEBHOOK_SECRET and checked in constant time, and a request without a valid signature gets
 * 401 and nothing else. It never reports the secret or the token, and it answers GitHub with a short
 * JSON body so a failure in the workspace is visible in the delivery list without leaking anything.
 *
 * A missing secret or service-role key is a 503 that names the environment variable. The rest of
 * the workspace is unaffected: only this route is off.
 *
 * Owner setup (also in docs/github-sync/README.md):
 *   payload URL  https://<workspace host>/api/github/webhook
 *   content type application/json
 *   events       Issues (only)
 *   secret       the value of GITHUB_WEBHOOK_SECRET
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GitHub's largest issue payloads are well under this; anything bigger is not a delivery. */
const MAX_BODY_BYTES = 1_000_000;

function answer(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const secret = githubWebhookSecret();
  if (secret === null) {
    return answer(503, {
      ok: false,
      error: "GITHUB_WEBHOOK_SECRET is not set on this deployment.",
    });
  }

  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return answer(413, { ok: false, error: "The delivery is too large." });
  }

  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    return answer(413, { ok: false, error: "The delivery is too large." });
  }

  if (!verifyWebhookSignature(secret, body, request.headers.get("x-hub-signature-256"))) {
    return answer(401, { ok: false, error: "The signature did not match." });
  }

  const event = (request.headers.get("x-github-event") ?? "").trim();
  if (event === "ping") return answer(200, { ok: true, ping: true });
  // Only issues are ours. Everything else is acknowledged so GitHub does not retry it.
  if (event !== "issues") return answer(200, { ok: true, ignored: true });

  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    return answer(400, { ok: false, error: "The delivery is not JSON." });
  }

  const issue = issueFromEvent(payload);
  if (issue === null) {
    // A `deleted` or `transferred` delivery can arrive without a readable issue. Acknowledge it:
    // there is nothing to store, and a retry would not make it readable.
    return answer(200, { ok: true, ignored: true });
  }

  const repo = serviceGithubRepo();
  if (repo === null) {
    return answer(503, {
      ok: false,
      error: "SUPABASE_SERVICE_ROLE_KEY is not set on this deployment.",
    });
  }

  try {
    const token = githubToken();
    const result = await applyInboundIssue(issue, {
      repo,
      token,
      makeClient: (value) => createGithubClient({ token: value, repository: githubRepository() }),
    });

    revalidatePath("/tasks");
    return answer(200, { ok: true, status: result.status, pushed: result.pushed });
  } catch {
    // The reason is in the sync log for the owner. The delivery's own message stays generic so a
    // database detail is not handed to whoever called the endpoint.
    return answer(500, { ok: false, error: "The issue could not be applied." });
  }
}
