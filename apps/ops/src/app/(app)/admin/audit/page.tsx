import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { AuditLogView } from "@/components/admin/audit-log-view";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { OWNER_ONLY_MESSAGE } from "@/lib/admin/rules";
import { getViewer } from "@/lib/auth/viewer";
import { demoMode } from "@/lib/flags";
import { listAuditAction } from "../actions";

export const metadata: Metadata = { title: "Admin audit log" };

export default async function AdminAuditPage() {
  if (demoMode()) {
    return (
      <EmptyState icon={ShieldAlert} title="Admin needs a database">
        Demo mode has no accounts and no audit log.
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

  const loaded = await listAuditAction({ limit: 300 });
  if (!loaded.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Audit log could not load</CardTitle>
          <CardDescription>{loaded.message}</CardDescription>
        </CardHeader>
        <CardBody>
          <p className="hint">
            If the database has not had the god mode migration yet, apply
            supabase/migrations/20261123000100_god_mode.sql and reload this page.
          </p>
        </CardBody>
      </Card>
    );
  }

  const nowIso = new Date().toISOString();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="overline">Owner</p>
        <h1 className="mt-1 text-2xl">Audit log</h1>
        <p className="hint mt-1">
          Who changed whose access, when, and why. Newest first. Times are UTC.
        </p>
      </div>

      <AdminTabs active="audit" />
      <AuditLogView entries={loaded.entries} nowIso={nowIso} />
    </div>
  );
}
