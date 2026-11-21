import { Users } from "lucide-react";
import type { Metadata } from "next";
import { AddMemberForm } from "@/components/settings/add-member-form";
import { DemoBanner } from "@/components/settings/demo-banner";
import {
  MembersTable,
  type MemberTableActions,
  type MemberTableRow,
} from "@/components/settings/members-table";
import { RolesCard } from "@/components/settings/roles-card";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePageAccess } from "@/lib/access/guard";
import { can } from "@/lib/db/permissions";
import { demoMode } from "@/lib/flags";
import { formatJoined, roleLabel } from "@/lib/members/format";
import { parseDemoViewer, settingsMembersRepo } from "@/lib/members/viewer";
import {
  addMemberAction,
  removeMemberAction,
  setMemberRoleAction,
  setMemberStatusAction,
} from "./actions";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  await requirePageAccess("settings.members");
  const demoViewer = parseDemoViewer(params.as);
  const repo = await settingsMembersRepo(demoViewer);
  const me = await repo.getMe();
  const demo = demoMode();

  if (me === null) {
    return (
      <EmptyState icon={Users} title="No member record">
        Your account is not on the workspace member list. Ask an owner to add you.
      </EmptyState>
    );
  }

  const viewer = { userId: me.userId, role: me.role, status: me.status };
  const canManage = can(viewer, "members.manage");

  // Owners get the email column; everyone else reads the table without it.
  const rows: MemberTableRow[] = canManage
    ? (await repo.listMembersWithEmail()).map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        email: member.email,
        role: member.role,
        status: member.status,
        joined: formatJoined(member.createdAt),
      }))
    : (await repo.listMembers()).map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        email: null,
        role: member.role,
        status: member.status,
        joined: formatJoined(member.createdAt),
      }));

  const actions: MemberTableActions = {
    setRole: setMemberRoleAction.bind(null, demoViewer),
    setStatus: setMemberStatusAction.bind(null, demoViewer),
    remove: removeMemberAction.bind(null, demoViewer),
  };

  return (
    <div className="flex flex-col gap-4">
      {demo ? <DemoBanner viewer={`${me.displayName} (${roleLabel(me.role)})`} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {canManage
              ? "Everyone with access to the workspace. Change a role, suspend or reactivate someone, or remove their access."
              : "Everyone with access to the workspace. Only an owner can change roles, suspend someone or remove access."}
          </CardDescription>
        </CardHeader>
        <CardBody>
          <MembersTable
            rows={rows}
            viewer={viewer}
            canManage={canManage}
            showEmail={canManage}
            actions={actions}
          />
        </CardBody>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Add member</CardTitle>
            <CardDescription>
              Add an account that already exists in Supabase. The account itself is created there,
              not here.
            </CardDescription>
          </CardHeader>
          <CardBody>
            <AddMemberForm action={addMemberAction.bind(null, demoViewer)} />
          </CardBody>
        </Card>
      ) : null}

      <RolesCard />
    </div>
  );
}
