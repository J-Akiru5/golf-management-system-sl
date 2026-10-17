import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { DeskPlayer } from "@/lib/demo/data";
import { fmtHcp, fmtIndex, photoOf } from "@/lib/format";
import type { Registration } from "@/lib/routing";
import { cn } from "@/lib/ui/cn";
import { Avatar, StatusPill } from "./bits";

interface Names {
  category: (id: string | null) => string;
  flight: (id: string | null) => string;
  tee: (id: string | null) => string;
}

/**
 * One consistent player card for the directory, the draw and the profile page.
 * Handicap Index (from NGAP) and playing handicap (worked out for the tee) are always labelled
 * apart, because mixing them up is the commonest scoring mistake on the day.
 * `hero` is the profile page's header: the name is the page heading.
 */
export function PlayerCard({
  player,
  reg,
  names,
  profileLink = true,
  variant = "compact",
  children,
}: {
  player: DeskPlayer;
  reg: Registration;
  names: Names;
  profileLink?: boolean;
  variant?: "compact" | "hero";
  children?: ReactNode;
}) {
  const hero = variant === "hero";
  const Name = hero ? "h1" : "h3";
  return (
    <div className={cn("card grid gap-4", hero && "gap-5 sm:p-6")}>
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          className={cn(
            hero && "[&>.avatar]:size-16 sm:[&>.avatar]:size-20 sm:[&>.avatar]:text-2xl",
          )}
        >
          <Avatar name={player.name} photo={photoOf(player)} large />
        </span>
        <div className="grid min-w-0 justify-items-start gap-1">
          {hero && <p className="overline">Player profile</p>}
          <Name
            className={cn(
              "min-w-0 break-words",
              hero && "text-[26px] leading-8 sm:text-[30px] sm:leading-9",
            )}
          >
            {player.name}
          </Name>
          <span className="text-[13px] text-ink-muted">
            {names.category(reg.categoryId)} · age {reg.age}
            {reg.teeId ? ` · ${names.tee(reg.teeId)} tee` : ""}
          </span>
          <StatusPill status={reg.status} />
        </div>
      </div>
      <dl className="m-0 grid grid-cols-3 gap-px overflow-hidden rounded-[12px] border border-line bg-line">
        <Fact label="Handicap Index" value={fmtIndex(player.index)} num />
        <Fact label="Playing HCP" value={fmtHcp(reg.playingHandicap)} num strong />
        <Fact label="Flight" value={names.flight(reg.flightId)} />
      </dl>
      {reg.reasons.length > 0 && (
        <p
          className={cn(
            "notice !py-2.5 text-[13px]",
            reg.status === "ineligible" ? "bad" : reg.status === "needs_review" && "warn",
          )}
        >
          {reg.reasons.join(" ")}
        </p>
      )}
      {(profileLink || children) && (
        <div className="flex flex-wrap items-center gap-2">
          {profileLink && (
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/players/${player.id}`}>
                Open profile
                <ChevronRight aria-hidden="true" />
              </Link>
            </Button>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

function Fact({
  label,
  value,
  num,
  strong,
}: {
  label: string;
  value: string;
  num?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="grid min-w-0 content-start gap-0.5 bg-surface-raised px-3 py-2.5">
      <dt className="text-[10.5px] leading-4 font-semibold tracking-[.08em] text-ink-muted uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "m-0 font-display text-lg leading-6 font-bold break-words",
          num && "tnum",
          strong && "text-fairway",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
