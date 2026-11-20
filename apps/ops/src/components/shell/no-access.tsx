import { BrandMark } from "@/components/shell/brand-mark";
import { Button } from "@/components/ui/button";

/**
 * Shown when a signed-in account has no workspace_members row or has been suspended. It fetches
 * nothing: there is nothing it is allowed to read.
 */
export function NoAccess({ signOut }: { signOut: () => Promise<void> }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <BrandMark />
      <h1 className="text-2xl">No access</h1>
      <p className="hint">
        This account is not on the workspace member list, or it has been suspended. Ask a workspace
        owner to add you.
      </p>
      <form action={signOut}>
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </form>
    </main>
  );
}
