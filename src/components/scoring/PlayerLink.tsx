import Link from "next/link";
import type { ReactElement } from "react";
import type { ClubRole } from "@/lib/auth/member";
import { canOpenPlayerProfile, playerProfileHref } from "@/lib/data/player-profile";
import { cn } from "@/lib/ui/cn";

export interface PlayerLinkProps {
  playerId: string;
  name: string;
  /** undefined in demo builds, null for an account with no club membership row. */
  role?: ClubRole | null;
  className?: string;
}

/**
 * A player name on the scores screen. The name is a link to the player profile only where the
 * signed-in account is allowed to open a staff profile page, and the link opens in the same tab.
 * Everywhere else the name stays plain bold text, so the page looks the same as before.
 */
export function PlayerLink({ playerId, name, role, className }: PlayerLinkProps): ReactElement {
  if (!canOpenPlayerProfile(role)) {
    return <b className={cn("font-bold text-ink", className)}>{name}</b>;
  }

  return (
    <Link
      href={playerProfileHref(playerId)}
      className={cn(
        "font-bold text-ink no-underline underline-offset-2 hover:underline",
        className,
      )}
    >
      {name}
    </Link>
  );
}
