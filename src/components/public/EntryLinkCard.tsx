"use client";

import { Link2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { configuredSiteUrl, entryUrl } from "@/lib/public-link";
import { useDesk } from "@/lib/store/desk-store";

/** A date field, read as a Manila calendar day rather than as midnight in the browser's zone. */
function cutOffLabel(date: string): string | null {
  const parsed = new Date(`${date}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
}

/**
 * The public entry link for the working event. Players open it and send their own entry; they do
 * not need an account, and everything they send arrives as Needs review on the registration desk.
 *
 * The link is built from NEXT_PUBLIC_SITE_URL, not from the current origin: the desk is often run on
 * localhost while the players are on the deployed domain, and a link copied from localhost is
 * useless to them. The current origin is only the development fallback.
 *
 * The card shows whether the event actually accepts entries. Copy is disabled when it does not,
 * because sending a closed or draft link only creates support calls.
 */
export function EntryLinkCard() {
  const { tournament, status } = useDesk();
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  // Read on the client only, so the first server render has no window access or clock.
  const [origin, setOrigin] = useState("");
  const [today, setToday] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
    setToday(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()));
  }, []);

  if (!tournament) return null;
  const site = configuredSiteUrl();
  const url = entryUrl({ tournamentId: tournament.id, siteUrl: site, origin: origin || undefined });
  const closeDate = tournament.cutOffDate ? cutOffLabel(tournament.cutOffDate) : null;
  const cutOffPassed = Boolean(today && tournament.cutOffDate && today > tournament.cutOffDate);
  const entryState =
    tournament.state === "draft"
      ? "draft"
      : tournament.state === "closed" || cutOffPassed
        ? "closed"
        : "open";
  const stateLabel =
    entryState === "open" ? "Open for entries" : entryState === "draft" ? "Draft event" : "Closed";
  const stateTone = entryState === "open" ? "ok" : entryState === "draft" ? "info" : "warn";

  async function copy() {
    if (entryState !== "open") return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied("ok");
    } catch {
      // Clipboard access can be refused; the link is on screen so it can still be copied by hand.
      setCopied("fail");
    }
    setTimeout(() => setCopied("idle"), 2500);
  }

  return (
    <div className="grid gap-2 rounded-[12px] border border-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <b className="flex flex-wrap items-center gap-1.5 text-[15px]">
            <Link2 className="size-4" aria-hidden="true" />
            Public entry link
            <span className={`pill ${stateTone}`}>{stateLabel}</span>
          </b>
          <span className="hint">
            {entryState === "open"
              ? "Send this to players. They need no account, and every entry arrives as Needs review."
              : entryState === "draft"
                ? "This event is still a draft. Players cannot enter until it is open."
                : "Entries are closed. The copy link is disabled until the event is open again."}
          </span>
          <span className="hint">
            {closeDate ? `Entry cut-off: ${closeDate}.` : "No entry cut-off is set."}
          </span>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={copy}
          disabled={entryState !== "open"}
        >
          {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed" : "Copy link"}
        </Button>
      </div>
      <code className="truncate text-[12px] text-ink-muted">{url}</code>
      {entryState !== "open" && (
        <p className="hint">
          Change the event state or cut-off in{" "}
          <Link className="underline" href="/setup#basics">
            Settings
          </Link>
          .
        </p>
      )}
      {status === "demo" && (
        <p className="hint">
          Demo mode: the link only works once Supabase is configured for this build.
        </p>
      )}
      {status !== "demo" && !site && (
        <p className="hint">
          No public site URL is configured, so this copies the address in your browser. Set{" "}
          <code>NEXT_PUBLIC_SITE_URL</code> to the deployed domain before sharing.
        </p>
      )}
    </div>
  );
}
