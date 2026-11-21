"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { adminErrorMessage, requireOwner } from "@/lib/admin/gate";
import { requestOrigin } from "@/lib/admin/origin";
import { type AdminClient, type AdminGateway, createAdminGateway } from "@/lib/admin/repo";
import {
  actionResult,
  bulkResult,
  cleanReason,
  isDeskRoleInput,
  isEmail,
  isWorkspaceRoleInput,
  normaliseApps,
  reasonProblem,
} from "@/lib/admin/rules";
import type {
  AccountListResult,
  AdminActionResult,
  AdminDataResult,
  AuditListResult,
  BulkAdminResult,
  BulkFailure,
  ClubListResult,
  DeskRoleInput,
  GodApp,
  InviteInput,
  WorkspaceRoleInput,
} from "@/lib/admin/types";
import type { Database } from "@/lib/db/types";
import { getServiceRoleSupabase } from "@/lib/supabase/service";

/**
 * The Admin server actions. Every one starts with `requireOwner`, which asks `ws_has_role` through
 * the caller's own session, before it reads anything or builds a service-role client. The database
 * functions repeat the same check, so a tampered browser gains nothing.
 */

const SERVICE_ROLE_MESSAGE =
  "Needs the service-role key on this project. Add SUPABASE_SERVICE_ROLE_KEY to the ops app.";

function gatewayFor(client: SupabaseClient<Database>): AdminGateway {
  return createAdminGateway(client as unknown as AdminClient);
}

function revalidateAdmin(): void {
  revalidatePath("/admin");
  revalidatePath("/admin/audit");
}

function fail(message: string): AdminActionResult {
  return actionResult(false, message);
}

function refusedBulk(message: string): BulkAdminResult {
  return { ok: false, message, succeeded: 0, failures: [] };
}

function cleanUserId(value: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function text(value: string): string {
  return typeof value === "string" ? value : "";
}

function screenName(value: string): string | null {
  const trimmed = text(value).trim();
  if (trimmed.length === 0 || Array.from(trimmed).length > 80) return null;
  return trimmed;
}

// ---------------------------------------------------------------------------------------------
// Reads

export async function listAccountsAction(): Promise<AccountListResult> {
  try {
    const client = await requireOwner();
    return { ok: true, accounts: await gatewayFor(client).listAccounts() };
  } catch (error) {
    return { ok: false, message: adminErrorMessage(error) };
  }
}

export async function listClubsAction(): Promise<ClubListResult> {
  try {
    const client = await requireOwner();
    return { ok: true, clubs: await gatewayFor(client).listClubs() };
  } catch (error) {
    return { ok: false, message: adminErrorMessage(error) };
  }
}

export async function listAuditAction(query?: {
  limit?: number;
  before?: string | null;
  action?: string | null;
  target?: string | null;
}): Promise<AuditListResult> {
  try {
    const client = await requireOwner();
    return { ok: true, entries: await gatewayFor(client).listAudit(query) };
  } catch (error) {
    return { ok: false, message: adminErrorMessage(error) };
  }
}

/** One gate, three reads: what the accounts page needs in a single round trip to the server. */
export async function loadAdminDataAction(): Promise<AdminDataResult> {
  try {
    const client = await requireOwner();
    const gateway = gatewayFor(client);
    const [accounts, clubs, audit] = await Promise.all([
      gateway.listAccounts(),
      gateway.listClubs(),
      gateway.listAudit({ limit: 200 }),
    ]);
    return { ok: true, data: { accounts, clubs, audit } };
  } catch (error) {
    return { ok: false, message: adminErrorMessage(error) };
  }
}

// ---------------------------------------------------------------------------------------------
// Workspace and desk roles

export async function setWorkspaceRoleAction(
  userId: string,
  role: WorkspaceRoleInput,
  reason: string,
): Promise<AdminActionResult> {
  try {
    const client = await requireOwner();
    const id = cleanUserId(userId);
    if (id === null) return fail("Choose a person.");
    if (!isWorkspaceRoleInput(role)) return fail("Choose a workspace role.");
    if (role === "none") {
      const problem = reasonProblem(text(reason));
      if (problem) return fail(problem);
    }

    await gatewayFor(client).setWorkspaceRole(id, role, text(reason));
    revalidateAdmin();
    return actionResult(
      true,
      role === "none" ? "Workspace access removed." : "Workspace role saved.",
    );
  } catch (error) {
    return fail(adminErrorMessage(error));
  }
}

export async function setDeskRoleAction(
  userId: string,
  clubId: string,
  role: DeskRoleInput,
  reason: string,
): Promise<AdminActionResult> {
  try {
    const client = await requireOwner();
    const id = cleanUserId(userId);
    const club = cleanUserId(clubId);
    if (id === null) return fail("Choose a person.");
    if (club === null) return fail("Choose a club.");
    if (!isDeskRoleInput(role)) return fail("Choose a desk role.");
    if (role === "none") {
      const problem = reasonProblem(text(reason));
      if (problem) return fail(problem);
    }

    await gatewayFor(client).setDeskRole(id, club, role, text(reason));
    revalidateAdmin();
    return actionResult(true, role === "none" ? "Desk access removed." : "Desk role saved.");
  } catch (error) {
    return fail(adminErrorMessage(error));
  }
}

// ---------------------------------------------------------------------------------------------
// Tabulator flag: Auth admin API, then an audit row through the owner-gated function

export async function setTabulatorAction(
  userId: string,
  enabled: boolean,
  reason: string,
): Promise<AdminActionResult> {
  try {
    const client = await requireOwner();
    const id = cleanUserId(userId);
    if (id === null) return fail("Choose a person.");

    if (enabled !== true) {
      const problem = reasonProblem(text(reason));
      if (problem) return fail(problem);
    }

    const service = getServiceRoleSupabase();
    if (service === null) return fail(SERVICE_ROLE_MESSAGE);

    const { data, error } = await service.auth.admin.getUserById(id);
    if (error) return fail(error.message);
    if (!data.user) return fail("That account no longer exists.");

    const metadata = { ...(data.user.app_metadata ?? {}) };
    if (enabled === true) metadata.scorecard_role = "tabulation";
    else delete metadata.scorecard_role;

    const { error: updateError } = await service.auth.admin.updateUserById(id, {
      app_metadata: metadata,
    });
    if (updateError) return fail(updateError.message);

    await gatewayFor(client).record(
      id,
      enabled === true ? "tabulator_on" : "tabulator_off",
      { enabled: enabled === true },
      text(reason),
    );
    revalidateAdmin();
    return actionResult(
      true,
      enabled === true ? "Tabulator access granted." : "Tabulator access removed.",
    );
  } catch (error) {
    return fail(adminErrorMessage(error));
  }
}

// ---------------------------------------------------------------------------------------------
// Suspend, restore, sign out

export async function suspendAction(
  userId: string,
  apps: GodApp[],
  reason: string,
): Promise<AdminActionResult> {
  try {
    const client = await requireOwner();
    const id = cleanUserId(userId);
    if (id === null) return fail("Choose a person.");
    const chosen = normaliseApps(Array.isArray(apps) ? apps : []);
    if (chosen.length === 0) return fail("Choose at least one app.");
    const problem = reasonProblem(text(reason));
    if (problem) return fail(problem);

    await gatewayFor(client).suspend(id, chosen, text(reason).trim());
    revalidateAdmin();
    return actionResult(true, "Suspended. Signed out everywhere.");
  } catch (error) {
    return fail(adminErrorMessage(error));
  }
}

export async function restoreAction(userId: string, reason: string): Promise<AdminActionResult> {
  try {
    const client = await requireOwner();
    const id = cleanUserId(userId);
    if (id === null) return fail("Choose a person.");

    await gatewayFor(client).restore(id, text(reason));
    revalidateAdmin();
    return actionResult(true, "Access restored.");
  } catch (error) {
    return fail(adminErrorMessage(error));
  }
}

export async function signOutEverywhereAction(
  userId: string,
  reason: string,
): Promise<AdminActionResult> {
  try {
    const client = await requireOwner();
    const id = cleanUserId(userId);
    if (id === null) return fail("Choose a person.");

    await gatewayFor(client).signOutEverywhere(id, text(reason));
    revalidateAdmin();
    return actionResult(true, "Signed out everywhere.");
  } catch (error) {
    return fail(adminErrorMessage(error));
  }
}

// ---------------------------------------------------------------------------------------------
// Password reset

export async function sendPasswordResetAction(
  userId: string,
  reason: string,
): Promise<AdminActionResult> {
  try {
    const client = await requireOwner();
    const id = cleanUserId(userId);
    if (id === null) return fail("Choose a person.");

    // The email comes from the account list, never from the browser, so a reset cannot be sent to
    // an address the caller chose.
    const accounts = await gatewayFor(client).listAccounts();
    const account = accounts.find((entry) => entry.userId === id);
    if (!account) return fail("That account no longer exists.");
    if (!account.email) return fail("That account has no email address.");

    const origin = await requestOrigin();
    if (origin === null) return fail("The app origin could not be read. Try again.");

    const { error } = await client.auth.resetPasswordForEmail(account.email, {
      redirectTo: `${origin}/auth/confirm?next=/auth/set-password`,
    });
    if (error) return fail(error.message);

    await gatewayFor(client).record(id, "password_reset", {}, text(reason));
    revalidateAdmin();
    return actionResult(true, `Password reset sent to ${account.email}.`);
  } catch (error) {
    return fail(adminErrorMessage(error));
  }
}

// ---------------------------------------------------------------------------------------------
// Invite

export async function inviteAction(input: InviteInput): Promise<AdminActionResult> {
  try {
    const client = await requireOwner();

    const email = text(input?.email).trim().toLowerCase();
    const displayName = screenName(input?.displayName);
    if (!isEmail(email)) return fail("Enter a valid email address.");
    if (displayName === null) return fail("Enter a display name of 80 characters or fewer.");
    if (!isWorkspaceRoleInput(input.workspaceRole)) return fail("Choose a workspace role.");
    if (!isDeskRoleInput(input.deskRole)) return fail("Choose a desk role.");

    const note = cleanReason(text(input.note));
    const wantsDesk = input.deskRole !== "none";
    if (wantsDesk && !cleanUserId(input.deskClubId ?? ""))
      return fail("Choose a club for the desk role.");
    if (input.workspaceRole === "none" && !wantsDesk && input.tabulator !== true) {
      return fail("Choose at least one kind of access for the invitation.");
    }

    const service = getServiceRoleSupabase();
    if (service === null) return fail(SERVICE_ROLE_MESSAGE);

    const origin = await requestOrigin();
    if (origin === null) return fail("The app origin could not be read. Try again.");

    const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/auth/confirm?next=/auth/set-password`,
      data: { display_name: displayName },
    });
    if (error) return fail(error.message);
    if (!data.user) return fail("The invitation was not created. Try again.");

    const userId = data.user.id;
    const gateway = gatewayFor(client);
    const problems: string[] = [];
    const applied: Record<string, unknown> = {};

    if (input.workspaceRole !== "none") {
      try {
        await gateway.setWorkspaceRole(userId, input.workspaceRole, note);
        applied.workspaceRole = input.workspaceRole;
      } catch (error) {
        problems.push(`workspace role: ${adminErrorMessage(error)}`);
      }
    }

    const deskClubId = cleanUserId(input.deskClubId ?? "");
    if (wantsDesk && deskClubId) {
      try {
        await gateway.setDeskRole(userId, deskClubId, input.deskRole, note);
        applied.deskRole = input.deskRole;
        applied.deskClubId = deskClubId;
      } catch (error) {
        problems.push(`desk role: ${adminErrorMessage(error)}`);
      }
    }

    if (input.tabulator === true) {
      try {
        const metadata = { ...(data.user.app_metadata ?? {}), scorecard_role: "tabulation" };
        const { error: metadataError } = await service.auth.admin.updateUserById(userId, {
          app_metadata: metadata,
        });
        if (metadataError) throw metadataError;
        applied.tabulator = true;
      } catch (error) {
        problems.push(`tabulator: ${adminErrorMessage(error)}`);
      }
    }

    await gateway.record(userId, "invite", { email, ...applied }, note);
    revalidateAdmin();

    if (problems.length > 0) {
      return actionResult(
        true,
        `Invitation sent to ${email}, but some access could not be added (${problems.join("; ")}). Assign it from the row.`,
      );
    }
    return actionResult(true, `Invitation sent to ${email}.`);
  } catch (error) {
    return fail(adminErrorMessage(error));
  }
}

// ---------------------------------------------------------------------------------------------
// Bulk

async function runBulk(
  userIds: ReadonlyArray<string>,
  label: string,
  run: (gateway: AdminGateway, userId: string) => Promise<void>,
): Promise<BulkAdminResult> {
  const client = await requireOwner();
  const gateway = gatewayFor(client);

  const unique = [
    ...new Set(
      userIds.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean),
    ),
  ];
  if (unique.length === 0) return bulkResult(label, 0, []);

  const emails = new Map<string, string | null>();
  try {
    for (const account of await gateway.listAccounts()) emails.set(account.userId, account.email);
  } catch {
    // The email is only for the report; the action still runs and the row id is enough.
  }

  const failures: BulkFailure[] = [];
  for (const userId of unique) {
    try {
      await run(gateway, userId);
    } catch (error) {
      failures.push({
        userId,
        email: emails.get(userId) ?? null,
        message: adminErrorMessage(error),
      });
    }
  }

  revalidateAdmin();
  return bulkResult(label, unique.length, failures);
}

export async function bulkWorkspaceRoleAction(
  userIds: string[],
  role: WorkspaceRoleInput,
  reason: string,
): Promise<BulkAdminResult> {
  try {
    if (!isWorkspaceRoleInput(role)) return refusedBulk("Choose a workspace role.");
    const problem = reasonProblem(text(reason));
    if (problem) return refusedBulk(problem);

    return await runBulk(
      Array.isArray(userIds) ? userIds : [],
      role === "none" ? "Removed workspace access from" : "Set the workspace role on",
      (gateway, userId) => gateway.setWorkspaceRole(userId, role, text(reason)),
    );
  } catch (error) {
    return refusedBulk(adminErrorMessage(error));
  }
}

export async function bulkSuspendAction(
  userIds: string[],
  apps: GodApp[],
  reason: string,
): Promise<BulkAdminResult> {
  try {
    const chosen = normaliseApps(Array.isArray(apps) ? apps : []);
    if (chosen.length === 0) return refusedBulk("Choose at least one app.");
    const problem = reasonProblem(text(reason));
    if (problem) return refusedBulk(problem);

    return await runBulk(Array.isArray(userIds) ? userIds : [], "Suspended", (gateway, userId) =>
      gateway.suspend(userId, chosen, text(reason).trim()),
    );
  } catch (error) {
    return refusedBulk(adminErrorMessage(error));
  }
}

export async function bulkRestoreAction(
  userIds: string[],
  reason: string,
): Promise<BulkAdminResult> {
  try {
    const problem = reasonProblem(text(reason));
    if (problem) return refusedBulk(problem);

    return await runBulk(Array.isArray(userIds) ? userIds : [], "Restored", (gateway, userId) =>
      gateway.restore(userId, cleanReason(text(reason))),
    );
  } catch (error) {
    return refusedBulk(adminErrorMessage(error));
  }
}

export async function bulkSignOutAction(
  userIds: string[],
  reason: string,
): Promise<BulkAdminResult> {
  try {
    const problem = reasonProblem(text(reason));
    if (problem) return refusedBulk(problem);

    return await runBulk(Array.isArray(userIds) ? userIds : [], "Signed out", (gateway, userId) =>
      gateway.signOutEverywhere(userId, cleanReason(text(reason))),
    );
  } catch (error) {
    return refusedBulk(adminErrorMessage(error));
  }
}
