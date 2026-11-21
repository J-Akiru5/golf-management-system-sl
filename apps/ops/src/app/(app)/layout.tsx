import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell, type ShellViewer } from "@/components/shell/app-shell";
import { NoAccess } from "@/components/shell/no-access";
import { fullAccess } from "@/lib/access/pages";
import { currentAccess } from "@/lib/access/server";
import { decideAccess } from "@/lib/auth/access";
import { getViewer } from "@/lib/auth/viewer";
import { demoMode, opsEnabled } from "@/lib/flags";
import { signOut } from "./actions";

/** What the shell shows in demo mode: no session, no database, the full menu. */
const DEMO_VIEWER: ShellViewer = {
  id: "demo-user",
  displayName: "Demo user",
  email: null,
  role: "owner",
  demo: true,
};

/**
 * The gate from SPEC section 4, in order: flag off, no session, no member row or suspended, then
 * the shell. The decision itself is the pure `decideAccess`; this file only maps it to a page.
 *
 * The shell also receives the person's effective access, because the menu is built from it: a page
 * at `none` is absent from the menu. The routes check their own page again; the menu is not the
 * protection.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const enabled = opsEnabled();
  if (!enabled) notFound();

  // Demo mode is for checking the interface without a database. It is impossible in a production
  // build, see demoMode().
  if (demoMode()) {
    return (
      <AppShell viewer={DEMO_VIEWER} access={fullAccess()} signOut={signOut}>
        {children}
      </AppShell>
    );
  }

  const viewer = await getViewer();
  const decision = decideAccess({
    enabled,
    signedIn: viewer !== null,
    member: viewer?.member?.status ?? null,
  });

  if (decision === "not_found") notFound();
  if (decision === "login") redirect("/login");
  if (decision === "no_access") return <NoAccess signOut={signOut} />;

  // "allow" means a session and an active member row. The check keeps the types honest.
  if (viewer === null || viewer.member === null) return <NoAccess signOut={signOut} />;

  const shellViewer: ShellViewer = {
    id: viewer.user.id,
    displayName: viewer.member.display_name,
    email: viewer.user.email ?? null,
    role: viewer.member.role,
    demo: false,
  };

  const access = await currentAccess();

  return (
    <AppShell viewer={shellViewer} access={access} signOut={signOut}>
      {children}
    </AppShell>
  );
}
