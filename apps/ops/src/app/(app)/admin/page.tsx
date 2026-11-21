import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { AccountsConsole } from "@/components/admin/accounts-console";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { StatChips } from "@/components/admin/stat-chips";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePageAccess } from "@/lib/access/guard";
import { loadPermissionMatrix } from "@/lib/access/server";
import { accountStats, OWNER_ONLY_MESSAGE } from "@/lib/admin/rules";
import type { AdminActions } from "@/lib/admin/types";
import { getViewer } from "@/lib/auth/viewer";
import { demoMode } from "@/lib/flags";
import { serviceRoleAvailable } from "@/lib/supabase/service";
import {
  bulkRestoreAction,
  bulkSignOutAction,
  bulkSuspendAction,
  bulkWorkspaceRoleAction,
  inviteAction,
  loadAdminDataAction,
  restoreAction,
  sendPasswordResetAction,
  setDeskRoleAction,
  setTabulatorAction,
  setWorkspaceRoleAction,
  signOutEverywhereAction,
  suspendAction,
} from "./actions";
import { setUserPermissionAction } from "./permissions-actions";

export const metadata: Metadata = { title: "Admin" };

const ACTIONS: AdminActions = {
  setWorkspaceRole: setWorkspaceRoleAction,
  setDeskRole: setDeskRoleAction,
  setTabulator: setTabulatorAction,
  suspend: suspendAction,
  restore: restoreAction,
  signOutEverywhere: signOutEverywhereAction,
  sendPasswordReset: sendPasswordResetAction,
  invite: inviteAction,
  bulkWorkspaceRole: bulkWorkspaceRoleAction,
  bulkSuspend: bulkSuspendAction,
  bulkRestore: bulkRestoreAction,
  bulkSignOut: bulkSignOutAction,
  setUserPermission: setUserPermissionAction,
};

export default async function AdminPage() {
  await requirePageAccess("admin");

  if (demoMode()) {
    return (
      <EmptyState icon={ShieldAlert} title="Admin needs a database">
        Demo mode has no accounts. Set the Supabase values and sign in as a workspace owner to open
        Admin.
      </EmptyState>
    );
  }

  const viewer = await getViewer();
  const member = viewer?.member;
  if (!viewer || !member || member.role !== "owner" || member.status !== "active") {
    return (
      <EmptyState icon={ShieldAlert} title={OWNER_ONLY_MESSAGE}>
        Your account does not have the owner role in this workspace.
      </EmptyState>
    );
  }

  const loaded = await loadAdminDataAction();
  if (!loaded.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Admin could not load</CardTitle>
          <CardDescription>{loaded.message}</CardDescription>
        </CardHeader>
        <CardBody>
          <p className="hint">
            If the database has not had the god mode migration yet, apply
            supabase/migrations/20261123000100_god_mode.sql (or docs/god-mode/apply-on-live.sql) and
            reload this page.
          </p>
        </CardBody>
      </Card>
    );
  }

  const nowIso = new Date().toISOString();
  const stats = accountStats(loaded.data.accounts, nowIso);
  const canUseServiceRole = serviceRoleAvailable();
  const permissions = await loadPermissionMatrix();
  const overrides = permissions.ok ? permissions.matrix.overrides : [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="overline flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Owner
        </p>
        <h1 className="mt-1 text-2xl">Admin</h1>
        <p className="hint mt-1">Every account, its access, and what changed</p>
      </div>

      <AdminTabs active="accounts" />
      <StatChips stats={stats} />

      <AccountsConsole
        accounts={loaded.data.accounts}
        clubs={loaded.data.clubs}
        audit={loaded.data.audit}
        overrides={overrides}
        permissionsReady={permissions.ok}
        viewerId={viewer.user.id}
        nowIso={nowIso}
        canUseServiceRole={canUseServiceRole}
        actions={ACTIONS}
      />
    </div>
  );
}
