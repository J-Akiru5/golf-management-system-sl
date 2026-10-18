"use client";

import { Crosshair } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { deskGuidesFor, type PlayerScreen, playerGuidesFor } from "@/lib/help/guides";
import { highlightHelpTarget } from "@/lib/help/highlight";
import { type HelpAudience, helpText } from "@/lib/help/types";
import { useI18n } from "@/lib/i18n/context";

/**
 * The help panel: a short step list for the screen the reader is on, then the rest.
 *
 * Steps that name a control get a "Show me" button: it closes the panel and rings that control, so
 * nobody has to guess which of the buttons on a busy screen the sentence means.
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
  const guides =
    audience === "desk"
      ? deskGuidesFor(screen ?? "")
      : playerGuidesFor((screen === "pairings" ? "pairings" : "my") as PlayerScreen);

  const show = (anchor: string) => {
    onOpenChange(false);
    // The panel is a portal: let it close before the ring is drawn, or the scroll fights the exit.
    window.setTimeout(() => highlightHelpTarget(anchor), 140);
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
                        onClick={() => show(step.anchor as string)}
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
