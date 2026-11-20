"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/ui/cn";
import { parseTheme, THEME_CHOICES, THEME_KEY, type ThemeChoice } from "./theme-prefs";

const THEME_EVENT = "teeline-ops:theme";

const ICONS = {
  auto: Monitor,
  light: Sun,
  dark: Moon,
} as const;

/** Applies a choice to the page and remembers it. System clears both. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "auto") delete root.dataset.theme;
  else root.dataset.theme = choice;

  try {
    if (choice === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // A private window can refuse storage. The choice still applies for this visit.
  }

  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * The theme in use. The `<html>` attribute is the truth because the stylesheet reads it; storage is
 * the fallback for the moment after hydration, before the boot script's value reaches React.
 */
export function themeSnapshot(): ThemeChoice {
  const applied = document.documentElement.dataset.theme;
  if (applied === "light" || applied === "dark") return applied;
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "auto";
  }
}

function subscribeTheme(listener: () => void): () => void {
  window.addEventListener(THEME_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(THEME_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/** Three choices, each a 44px target. The label is visible where there is room. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot, () => "auto" as ThemeChoice);

  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-line-strong p-0.5",
        className,
      )}
    >
      {THEME_CHOICES.map((choice) => {
        const Icon = ICONS[choice.id];
        const active = theme === choice.id;
        return (
          <button
            key={choice.id}
            type="button"
            aria-pressed={active}
            onClick={() => applyTheme(choice.id)}
            className={cn(
              "inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-sm px-2.5 text-[12px] font-semibold transition-colors",
              active ? "bg-surface-sunken text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{choice.label}</span>
            <span className="sr-only sm:hidden">{choice.label}</span>
          </button>
        );
      })}
    </div>
  );
}
