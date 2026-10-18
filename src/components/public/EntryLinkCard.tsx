"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/store/desk-store";

/**
 * The public entry link for the working event. Players open it and send their own entry; they do
 * not need an account, and everything they send arrives as Needs review on the registration desk.
 */
export function EntryLinkCard() {
  const { tournament, status } = useDesk();
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  if (!tournament) return null;
  const path = `/enter/${tournament.id}`;

  async function copy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied("ok");
    } catch {
      // Clipboard access can be refused; the path is on screen so it can still be copied by hand.
      setCopied("fail");
    }
    setTimeout(() => setCopied("idle"), 2500);
  }

  return (
    <div className="grid gap-2 rounded-[12px] border border-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <b className="flex items-center gap-1.5 text-[15px]">
            <Link2 className="size-4" aria-hidden="true" />
            Public entry link
          </b>
          <span className="hint">
            Send this to players. They need no account, and every entry arrives as Needs review.
          </span>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed" : "Copy link"}
        </Button>
      </div>
      <code className="truncate text-[12px] text-ink-muted">{path}</code>
      {status === "demo" && (
        <p className="hint">
          Demo mode: the link only works once Supabase is configured for this build.
        </p>
      )}
    </div>
  );
}
