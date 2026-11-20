import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WORKSPACE_ROLES } from "@/lib/db/constants";

/** The three roles in plain words, taken from the one list the rest of the app uses. */
export function RolesCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles</CardTitle>
        <CardDescription>What each role can do in the workspace.</CardDescription>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <dl className="grid gap-3 sm:grid-cols-3">
          {WORKSPACE_ROLES.map((role) => (
            <div key={role.id} className="rounded-md border border-line p-3">
              <dt className="font-display text-sm font-bold text-ink">{role.label}</dt>
              <dd className="mt-1 text-sm text-ink-muted">{role.summary}</dd>
            </div>
          ))}
        </dl>
        <p className="hint">
          Accounts are created in Supabase by the project owner. Adding someone here gives an
          existing account access to the workspace, and does not create an account.
        </p>
      </CardBody>
    </Card>
  );
}
