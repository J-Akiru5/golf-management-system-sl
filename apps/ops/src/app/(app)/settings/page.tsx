import { UserRound } from "lucide-react";
import type { Metadata } from "next";
import { AboutWorkspaceCard } from "@/components/settings/about-workspace-card";
import { DemoBanner } from "@/components/settings/demo-banner";
import { GithubSettings, type GithubSettingsActions } from "@/components/settings/github-settings";
import { ProfileNameForm } from "@/components/settings/profile-name-form";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePageAccess } from "@/lib/access/guard";
import { levelFor } from "@/lib/access/pages";
import { currentAccess } from "@/lib/access/server";
import { demoMode, opsEnabled } from "@/lib/flags";
import { githubConnection } from "@/lib/github/config";
import { serverGithubRepo } from "@/lib/github/repo";
import type { GithubSyncLogRow, GithubUserMapRow } from "@/lib/github/types";
import { formatJoined, roleLabel, roleSummary } from "@/lib/members/format";
import { parseDemoViewer, settingsMembersRepo } from "@/lib/members/viewer";
import { getRepos } from "@/lib/repos";
import type { TaskMember } from "@/lib/tasks/types";
import { updateDisplayNameAction } from "./actions";
import {
  importOpenIssuesAction,
  removeGithubMappingAction,
  saveGithubMappingAction,
} from "./github-actions";

export const metadata: Metadata = { title: "Profile" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  await requirePageAccess("settings.profile");
  const demoViewer = parseDemoViewer(params.as);
  const repo = await settingsMembersRepo(demoViewer);
  const me = await repo.getMe();
  const demo = demoMode();
  const canEdit = levelFor(await currentAccess(), "settings.profile") === "edit";

  if (me === null) {
    return (
      <EmptyState icon={UserRound} title="No member record">
        Your account is not on the workspace member list. Ask an owner to add you.
      </EmptyState>
    );
  }

  // The GitHub section is owner-only, on this page rather than a page of its own, so it needs no
  // entry in the page registry and no new permission row.
  const isOwner = me.role === "owner" && me.status === "active";
  const connection = githubConnection();
  let mappings: GithubUserMapRow[] = [];
  let log: GithubSyncLogRow[] = [];
  let members: TaskMember[] = [];
  let githubUnavailable: string | null = null;

  if (isOwner && !demo) {
    try {
      const syncRepo = await serverGithubRepo();
      const taskRepo = await getRepos();
      const [mapRows, logRows, memberRows] = await Promise.all([
        syncRepo.listUserMap(),
        syncRepo.listLog(20),
        taskRepo.tasks.listMembers(),
      ]);
      mappings = mapRows;
      log = logRows;
      members = memberRows;
    } catch {
      githubUnavailable =
        "The GitHub tables could not be read. Apply docs/github-sync/apply-on-live.sql, then reload this page.";
    }
  }

  const githubActions: GithubSettingsActions = {
    importIssues: importOpenIssuesAction.bind(null, demoViewer),
    saveMapping: saveGithubMappingAction.bind(null, demoViewer),
    removeMapping: removeGithubMappingAction.bind(null, demoViewer),
  };

  return (
    <div className="flex flex-col gap-4">
      {demo ? <DemoBanner viewer={`${me.displayName} (${roleLabel(me.role)})`} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your profile</CardTitle>
            <CardDescription>Your name is what teammates see in the workspace.</CardDescription>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <ProfileNameForm
              name={me.displayName}
              action={updateDisplayNameAction.bind(null, demoViewer)}
              canEdit={canEdit}
            />
            <dl className="flex flex-col gap-3">
              <div>
                <dt className="overline">Role</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{roleLabel(me.role)}</Badge>
                  <span className="text-sm text-ink-muted">{roleSummary(me.role)}</span>
                </dd>
              </div>
              <div>
                <dt className="overline">Email</dt>
                <dd className="mt-1 break-all text-sm text-ink">
                  {me.email ?? "No email on this account"}
                </dd>
              </div>
              <div>
                <dt className="overline">Member since</dt>
                <dd className="tnum mt-1 text-sm text-ink">{formatJoined(me.createdAt)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>System follows your device setting.</CardDescription>
          </CardHeader>
          <CardBody>
            <ThemeToggle />
          </CardBody>
        </Card>
      </div>

      <AboutWorkspaceCard demo={demo} enabled={opsEnabled()} />

      {isOwner ? (
        <GithubSettings
          connection={connection}
          mappings={mappings}
          log={log}
          members={members}
          unavailable={githubUnavailable}
          actions={githubActions}
        />
      ) : null}
    </div>
  );
}
