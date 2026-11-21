import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/shell/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { demoMode, opsEnabled } from "@/lib/flags";
import { getServerSupabase } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Choose your password" };

/**
 * Where an invite or a reset link lands after the confirm route has set the session. The person
 * chooses their own password here; the owner never sees or sets it.
 */
export default async function SetPasswordPage() {
  if (!opsEnabled()) notFound();

  let signedIn = false;
  if (!demoMode()) {
    try {
      const supabase = await getServerSupabase();
      const { data } = await supabase.auth.getUser();
      signedIn = Boolean(data.user);
    } catch {
      signedIn = false;
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <BrandMark height="h-10" />

      {signedIn ? (
        <Card>
          <CardHeader>
            <CardTitle>Choose your password</CardTitle>
            <CardDescription>
              This is your own password. Nobody at the club will see it or ask you for it.
            </CardDescription>
          </CardHeader>
          <CardBody>
            <SetPasswordForm />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>The link has expired</CardTitle>
            <CardDescription>
              Open the newest link from your email again, in this browser. If it still does not
              work, ask a workspace owner to send a new one.
            </CardDescription>
          </CardHeader>
          <CardBody>
            <Button asChild variant="secondary">
              <a href="/login">Back to sign in</a>
            </Button>
          </CardBody>
        </Card>
      )}

      <p className="hint">TeeLine Workspace. Internal use only.</p>
    </main>
  );
}
