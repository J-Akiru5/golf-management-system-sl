"use client";

import { Crosshair } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { deskGuidesFor, type PlayerScreen, playerGuidesFor } from "@/lib/help/guides";
import { findHelpTarget, highlightHelpTarget } from "@/lib/help/highlight";
import {
  claimHelpTarget,
  peekHelpTarget,
  requestHelpTarget,
  revealHelpTarget,
} from "@/lib/help/reveal";
import {
  type HelpAudience,
  type HelpGuide,
  type HelpStep,
  helpText,
  stepRoute,
} from "@/lib/help/types";
import { useI18n } from "@/lib/i18n/context";

/**
 * The help panel: a short step list for the screen the reader is on, then the rest.
 *
 * Steps that name a control get a "Show me" button: it closes the panel and rings that control, so
 * nobody has to guess which of the buttons on a busy screen the sentence means. A step can point
 * at another screen: then "Show me" navigates first and rings once that page has rendered (see
 * `reveal.ts`).
 *
 * The words come from the i18n context (player copy is translated; desk copy is English literals in
 * `src/lib/help/guides.ts`). The desk has no provider mounted, so its chrome copy falls back to the
 * English dictionary.
 */
export function HelpSheet({
  open,
  onOpenChange,
  audience,
  screen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audience: HelpAudience;
  /** Desk: the current path. Player: "my" or "pairings". */
  screen?: string;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [missing, setMissing] = useState(false);
  // The preview passes an inline callback. Keeping it in a ref means a normal re-render cannot
  // restart a reveal that is still waiting for the page.
  const openChange = useRef(onOpenChange);
  useEffect(() => {
    openChange.current = onOpenChange;
  }, [onOpenChange]);
  const guides =
    audience === "desk"
      ? deskGuidesFor(screen ?? "")
      : playerGuidesFor((screen === "pairings" ? "pairings" : "my") as PlayerScreen);

  // A step on another screen asked for a ring before the navigation. This page may be a fresh
  // component (desk to player crosses layouts), so the request lives outside React and is claimed
  // exactly once.
  useEffect(() => {
    const request = peekHelpTarget(pathname);
    if (!request) return;
    return revealHelpTarget(request.anchor, {
      highlight: (anchor, doc) => {
        if (!claimHelpTarget(request)) return true;
        return highlightHelpTarget(anchor, doc);
      },
      onMissing: () => {
        if (!claimHelpTarget(request)) return;
        setMissing(true);
        openChange.current(true);
      },
    });
  }, [pathname]);

  // The note belongs to the attempt that missed, not to every later visit to the panel.
  useEffect(() => {
    if (!open) setMissing(false);
  }, [open]);

  const show = (guide: HelpGuide, step: HelpStep) => {
    const anchor = step.anchor;
    if (!anchor) return;
    const route = stepRoute(guide, step);
    setMissing(false);

    // No route, or the control is on this screen: keep the old behaviour, with a plain answer
    // when a conditional control is not here at the moment (pairings before they are published).
    if (!route || route === pathname) {
      if (!findHelpTarget(document, anchor)) {
        setMissing(true);
        return;
      }
      onOpenChange(false);
      // The panel is a portal: let it close before the ring is drawn, or the scroll fights the exit.
      window.setTimeout(() => {
        revealHelpTarget(anchor, {
          onMissing: () => {
            setMissing(true);
            onOpenChange(true);
          },
        });
      }, 140);
      return;
    }

    // The control lives on another screen. Close first, remember what to ring, then navigate.
    onOpenChange(false);
    requestHelpTarget(anchor, route);
    router.push(route);
  };

  return (
    // Non-modal for the same reason the welcome is: the panel is a reference, not a gate. The
    // backdrop still takes the clicks and closes it, Escape closes it, and focus moves in. What it
    // does not do is mark the page behind `aria-hidden`, which is what React reported as a
    // hydration mismatch when the sheet opened on a page that was still hydrating.
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        title={t("help.title")}
        description={guides[0] ? helpText(guides[0].title, t) : undefined}
        className="gap-3"
        data-help="help-sheet"
      >
        {missing && (
          <p className="notice warn text-[13px]" role="status">
            {t("help.missing")}
          </p>
        )}
        <div className="grid gap-3">
          {guides.map((guide, index) => (
            <details
              key={guide.id}
              open={index === 0}
              className="overflow-hidden rounded-[14px] border border-line bg-surface-raised"
            >
              <summary className="cursor-pointer list-none px-3.5 py-3 font-semibold">
                {helpText(guide.title, t)}
              </summary>
              {guide.summary && <p className="hint px-3.5 pb-1">{helpText(guide.summary, t)}</p>}
              <ol className="grid list-decimal gap-2.5 pr-3.5 pb-3.5 pl-9 text-[13px] leading-5">
                {guide.steps.map((step, stepIndex) => (
                  <li key={stepIndex} className="grid gap-1.5">
                    <span>{helpText(step.text, t)}</span>
                    {step.anchor && (
                      <button
                        type="button"
                        onClick={() => show(guide, step)}
                        className="btn small ghost justify-self-start"
                      >
                        <Crosshair className="size-3.5" aria-hidden="true" />
                        {t("help.showMe")}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>
        <p className="hint mt-auto">{t("help.more")}</p>
      </SheetContent>
    </Sheet>
  );
}
