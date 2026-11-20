import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BrandMark } from "@/components/shell/brand-mark";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { getViewer } from "@/lib/auth/viewer";
import { demoMode, opsEnabled } from "@/lib/flags";
import { signIn } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // The proxy already answers 404 when the flag is off. This is the second guard, for a request
  // that reaches the page some other way.
  if (!opsEnabled()) notFound();

  // Demo mode has no accounts. Send the visitor straight in rather than showing a form that cannot
  // work.
  if (demoMode()) redirect("/");

  const viewer = await getViewer();
  if (viewer) redirect("/");

  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <BrandMark height="h-10" />
        <h1 className="text-2xl">Sign in</h1>
        <p className="hint">The workspace is for team members only.</p>
      </div>

      <form action={signIn} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-ink"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary">
          Sign in
        </Button>
      </form>

      <p className="hint">
        No account? Ask a workspace owner to add your email. Accounts are created outside this app.
      </p>
    </main>
  );
}
