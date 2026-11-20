"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { WORKSPACE_ROLES } from "@/lib/db/constants";
import type { WorkspaceRole } from "@/lib/db/types";
import { cn } from "@/lib/ui/cn";

export type ShellViewer = {
  id: string;
  displayName: string;
  email: string | null;
  role: WorkspaceRole;
  demo: boolean;
};

export function roleLabel(role: WorkspaceRole): string {
  return WORKSPACE_ROLES.find((entry) => entry.id === role)?.label ?? role;
}

function Meta({ viewer }: { viewer: ShellViewer }) {
  return (
    <div className="flex items-center gap-2">
      <Badge tone="neutral">{roleLabel(viewer.role)}</Badge>
      {viewer.demo ? <Badge tone="gold">Demo data</Badge> : null}
    </div>
  );
}

/** The top bar's account control: who you are, your role, and the way out. */
export function UserMenu({
  viewer,
  signOut,
}: {
  viewer: ShellViewer;
  signOut: () => Promise<void>;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex min-h-11 items-center gap-2 rounded-md border border-line-strong px-2 text-left hover:bg-surface-sunken"
        aria-label={`Account: ${viewer.displayName}`}
      >
        <Avatar id={viewer.id} name={viewer.displayName} size="sm" />
        <span className="hidden sm:block">
          <span className="block text-[13px] font-semibold leading-tight text-ink">
            {viewer.displayName}
          </span>
          <span className="block text-[11px] uppercase tracking-wide text-ink-muted">
            {roleLabel(viewer.role)}
          </span>
        </span>
        <ChevronDown className="size-4 text-ink-muted" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-56 rounded-md border border-line bg-surface-raised p-1 text-ink shadow-lift"
        >
          <div className="px-2 py-2">
            <p className="text-sm font-semibold">{viewer.displayName}</p>
            <p className="text-xs text-ink-muted">{viewer.email ?? "No email on this account"}</p>
            <div className="mt-2">
              <Meta viewer={viewer} />
            </div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          {viewer.demo ? (
            <p className="px-2 py-2 text-xs text-ink-muted">
              Demo mode. There is no session to sign out of.
            </p>
          ) : (
            <form action={signOut}>
              <DropdownMenu.Item asChild>
                <button
                  type="submit"
                  className="flex min-h-11 w-full items-center gap-2 rounded-sm px-2 text-left text-sm font-medium text-ink outline-none data-[highlighted]:bg-surface-sunken"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Sign out
                </button>
              </DropdownMenu.Item>
            </form>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** The same facts, laid flat, for the phone menu. */
export function UserCard({
  viewer,
  signOut,
  className,
}: {
  viewer: ShellViewer;
  signOut: () => Promise<void>;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-line bg-surface-raised p-3", className)}>
      <div className="flex items-center gap-3">
        <Avatar id={viewer.id} name={viewer.displayName} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{viewer.displayName}</p>
          <p className="truncate text-xs text-ink-muted">
            {viewer.email ?? "No email on this account"}
          </p>
        </div>
      </div>
      <div className="mt-2">
        <Meta viewer={viewer} />
      </div>
      {viewer.demo ? (
        <p className="mt-2 text-xs text-ink-muted">
          Demo mode. There is no session to sign out of.
        </p>
      ) : (
        <form action={signOut} className="mt-3">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong px-3 text-sm font-semibold text-ink hover:bg-surface-sunken"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </button>
        </form>
      )}
    </div>
  );
}
