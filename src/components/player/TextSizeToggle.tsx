"use client";

import { Type } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/ui/cn";

/**
 * Larger type for reading outdoors. The choice is one attribute on <html>, so every page of the
 * player app and the public pairings gets it without a second layout, and it survives a reload.
 *
 * It has to be a client component: the server cannot know what this phone stored. The label is
 * always visible and the control is at least 44 px, because this is used one-handed in the sun.
 */
const KEY = "teeline.text-size";
const ATTR = "data-textsize";

export function TextSizeToggle({
  className,
  compact = false,
}: {
  className?: string;
  /** Icon only on phones, for a crowded toolbar. The accessible name stays. */
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [large, setLarge] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let saved = "normal";
    try {
      saved = window.localStorage.getItem(KEY) === "large" ? "large" : "normal";
    } catch {
      // Private mode or a blocked store: the default is fine, the page still reads.
    }
    setLarge(saved === "large");
    setReady(true);
    document.documentElement.setAttribute(ATTR, saved);
  }, []);

  const toggle = () => {
    const next = large ? "normal" : "large";
    setLarge(next === "large");
    document.documentElement.setAttribute(ATTR, next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // The page keeps the choice for this visit even when it cannot be stored.
    }
  };

  return (
    <button
      type="button"
      className={cn("btn ghost no-print gap-2", className)}
      aria-pressed={large}
      aria-label={t("pairings.largeText")}
      onClick={toggle}
      data-testid="text-size-toggle"
      data-onboard="large-text"
      // Before the effect runs the label is the default, so the first paint is stable.
      suppressHydrationWarning
    >
      <Type className="size-4 shrink-0" aria-hidden="true" />
      <span className={compact ? "hidden sm:inline" : undefined}>{t("pairings.largeText")}</span>
      <span className="sr-only">{ready && large ? t("pairings.largeTextOn") : ""}</span>
    </button>
  );
}
