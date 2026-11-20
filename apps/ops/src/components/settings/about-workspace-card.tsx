import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The plain facts about the workspace: who it is for, who can see it, whether the feature flag is
 * on, and where the data comes from. The values are read by the page, not guessed here.
 */
export function AboutWorkspaceCard({ demo, enabled }: { demo: boolean; enabled: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>About this workspace</CardTitle>
        <CardDescription>Internal to Syntaxure Labs, MDM Events and ZenLabs.</CardDescription>
      </CardHeader>
      <CardBody>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="overline">Who can see it</dt>
            <dd className="mt-1 text-sm text-ink">
              Active workspace members only. Tournament staff and desk accounts are not included,
              even when they work on the same tournaments.
            </dd>
          </div>
          <div>
            <dt className="overline">Feature flag</dt>
            <dd className="mt-1 text-sm text-ink">
              {enabled
                ? "On. The workspace routes are open to members."
                : "Off. Every route returns not found."}
            </dd>
          </div>
          <div>
            <dt className="overline">Data source</dt>
            <dd className="mt-1 text-sm text-ink">
              {demo
                ? "Demo data, held in memory. Nothing is saved."
                : "Supabase, read as your own session."}
            </dd>
          </div>
          <div>
            <dt className="overline">Accounts</dt>
            <dd className="mt-1 text-sm text-ink">
              Accounts are created in Supabase by the project owner. This app never holds a
              service-role key.
            </dd>
          </div>
        </dl>
      </CardBody>
    </Card>
  );
}
