import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { type PermissionActions, PermissionsMatrix } from "@/components/admin/permissions-matrix";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePageAccess } from "@/lib/access/guard";
import { OWNER_ONLY_MESSAGE } from "@/lib/admin/rules";
import { getViewer } from "@/lib/auth/viewer";
import { demoMode } from "@/lib/flags";
import { loadPermissionsAction, setRolePermissionAction } from "../permissions-actions";

export const metadata: Metadata = { title: "Admin permissions" };

export default async function AdminPermissionsPage() {
  await requirePageAccess("admin");

  if (demoMode()) {
    return (
      <EmptyState icon={ShieldAlert} title="Admin needs a database">
        Demo mode has no accounts and no permissions. Set the Supabase values and sign in as a
        workspace owner to open Admin.
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

  const loaded = await loadPermissionsAction();

  const actions: PermissionActions = { setRolePermission: setRolePermissionAction };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="overline flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Owner
        </p>
        <h1 className="mt-1 text-2xl">Permissions</h1>
        <p className="hint mt-1">
          A page with No access is hidden from that person&apos;s menu and refused if they open its
          address. View lets them read; Edit lets them change.
        </p>
      </div>

      <AdminTabs active="permissions" />

      {loaded.ok ? (
        <>
          <p className="hint">
            The owner keeps Edit on every page and cannot be lowered. A single person can be given a
            different level for a page in their Access section on the Accounts tab; that wins over
            the role default.
          </p>
          <PermissionsMatrix matrix={loaded.matrix} actions={actions} />
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Permissions could not load</CardTitle>
            <CardDescription>{loaded.message}</CardDescription>
          </CardHeader>
          <CardBody>
            <p className="hint">
              If the database has not had the permissions migration yet, apply
              supabase/migrations/20261123000200_workspace_permissions.sql (or
              docs/permissions/apply-on-live.sql) and reload this page. Until then the workspace
              uses the role defaults, so nobody is locked out.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
