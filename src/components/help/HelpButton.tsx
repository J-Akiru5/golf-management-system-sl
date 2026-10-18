"use client";

import { CircleHelp } from "lucide-react";
import { useState } from "react";
import { HelpSheet } from "@/components/help/HelpSheet";
import type { HelpAudience } from "@/lib/help/types";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/ui/cn";

/**
 * The "?" every shell carries. One button, in the top bar, exactly as the design agreed: it opens
 * the panel for whatever screen the reader is on. The className mirrors the alerts bell so the two
 * sit together in the chrome in both themes.
 */
export function HelpButton({
  audience,
  screen,
  overlay = false,
  className,
}: {
  audience: HelpAudience;
  /** Desk: the current path. Player: "my" or "pairings". */
  screen?: string;
  overlay?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("help.button")}
        aria-haspopup="dialog"
        data-help="help-button"
        className={cn(
          "grid size-11 place-items-center rounded-full",
          overlay ? "glass" : "border border-[rgba(238,240,234,0.25)]",
        )}
      >
        <CircleHelp className="size-5" aria-hidden="true" />
      </button>
      <HelpSheet open={open} onOpenChange={setOpen} audience={audience} screen={screen} />
    </div>
  );
}
