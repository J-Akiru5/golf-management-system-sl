import { UserRound } from "lucide-react";
import type { Metadata } from "next";
import { AboutWorkspaceCard } from "@/components/settings/about-workspace-card";
import { DemoBanner } from "@/components/settings/demo-banner";
import { ProfileNameForm } from "@/components/settings/profile-name-form";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { demoMode, opsEnabled } from "@/lib/flags";
import { formatJoined, roleLabel, roleSummary } from "@/lib/members/format";
import { parseDemoViewer, settingsMembersRepo } from "@/lib/members/viewer";
import { updateDisplayNameAction } from "./actions";

export const metadata: Metadata = { title: "Profile" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const demoViewer = parseDemoViewer(params.as);
  const repo = await settingsMembersRepo(demoViewer);
  const me = await repo.getMe();
  const demo = demoMode();

  if (me === null) {
    return (
      <EmptyState icon={UserRound} title="No member record">
        Your account is not on the workspace member list. Ask an owner to add you.
      </EmptyState>
    );
  }

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
    </div>
  );
}
