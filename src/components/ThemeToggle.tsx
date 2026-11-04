"use client";

import { Check, ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { useEffect, useSyncExternalStore } from "react";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/ui/cn";

export type ThemeChoice = "auto" | "light" | "dark";
export const THEME_KEY = "starter-theme";

/** Runs before first paint (see layout.tsx) so a saved choice never flashes the wrong theme. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const THEME_EVENT = "teeline:theme";

/** Only an explicit light or dark is a choice; everything else is System. */
export function parseTheme(value: string | null | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "auto";
}

/**
 * The theme the page is showing. The `<html>` attribute is the truth because the stylesheet reads
 * it; storage is the fallback for the moment after hydration, before ThemeSync has put it back.
 */
export function themeSnapshot(): ThemeChoice {
  if (typeof document === "undefined") return "auto";
  const applied = document.documentElement.dataset.theme;
  if (applied === "light" || applied === "dark") return applied;
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "auto";
  }
}

/** Keeps every theme control in step, including one in another tab. */
export function subscribeTheme(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(THEME_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(THEME_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * The three choices, in the club's words as well as the plain ones: the design tokens are called
 * Ivory and Charcoal, and someone reading the menu should not have to guess that Light is Ivory.
 */
export const THEME_CHOICES: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { id: "auto", label: "System", icon: Monitor },
  { id: "light", label: "Light (Ivory)", icon: Sun },
  { id: "dark", label: "Dark (Charcoal)", icon: Moon },
];

function apply(choice: ThemeChoice) {
  if (choice === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  try {
    if (choice === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Private windows can refuse storage. The choice still applies for this visit.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * Puts the saved choice back on `<html>` after hydration and on every route change.
 *
 * The pre-paint script is what keeps the first load from flashing, but React owns `<html>` and a
 * hydration pass can drop the attribute the script set. Without this repair the next page load or
 * route fell back to the operating system's theme with the choice still saved.
 */
export function ThemeSync() {
  const path = usePathname();
  useEffect(() => {
    try {
      const saved = parseTheme(localStorage.getItem(THEME_KEY));
      if (saved === "auto") {
        if (document.documentElement.dataset.theme) apply("auto");
        return;
      }
      if (document.documentElement.dataset.theme !== saved) apply(saved);
    } catch {
      // Storage refused: the pre-paint script already applied what it could.
    }
  }, [path]);
  return null;
}

/**
 * The theme dropdown: System, Light (Ivory) or Dark (Charcoal), remembered per browser. Storage is
 * only a convenience; the pre-paint script is what keeps a reload from flashing.
 *
 * Two shapes, one control, because the rail is 60px wide when compact: an icon button there, and a
 * labelled row in the expanded rail and the mobile menu. Both open the same menu, and picking an
 * option closes it.
 */
export function ThemeToggle({
  compact = false,
  tone = "sheet",
}: {
  compact?: boolean;
  /**
   * "rail" is the dark chrome of the left rail; "sheet" is a page surface (the mobile menu); "nav"
   * is the dark hero bar of the public site, which needs the hairline pill the sign-in link uses.
   */
  tone?: "rail" | "sheet" | "nav";
}) {
  const choice = useSyncExternalStore(subscribeTheme, themeSnapshot, () => "auto" as ThemeChoice);

  const pick = (c: ThemeChoice) => {
    apply(c);
  };

  const current = THEME_CHOICES.find((c) => c.id === choice) ?? THEME_CHOICES[0];
  if (!current) return null;
  const Icon = current.icon;

  const triggerButton = compact ? (
    <button
      type="button"
      aria-label={`Colour theme: ${current.label}`}
      className={cn(
        "grid size-11 place-items-center rounded-full",
        tone === "nav"
          ? "border border-[rgba(247,245,238,0.55)] bg-[rgba(8,33,25,0.18)] text-[#f7f5ee] backdrop-blur-md hover:text-[#e5c77a]"
          : "text-on-forest-muted hover:bg-[rgba(238,240,234,0.1)] hover:text-on-forest",
      )}
    >
      <Icon className="size-[18px]" aria-hidden="true" />
    </button>
  ) : (
    <button
      type="button"
      className={cn(
        "flex h-11 w-full items-center gap-2.5 rounded-md px-3 text-[13px] font-medium",
        tone === "rail"
          ? "rounded-full text-on-forest-muted hover:bg-[rgba(238,240,234,0.1)] hover:text-on-forest"
          : "border border-line bg-surface-raised text-ink hover:bg-surface-sunken",
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      <span className="flex-1 truncate text-left">{current.label}</span>
      <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden="true" />
    </button>
  );

  // The tooltip wraps the menu trigger, not the other way round: a trigger built with `asChild`
  // hands its props to its child, and a component that does not pass them on would swallow them
  // (the menu then simply never opens).
  // The public nav has no TooltipProvider (the desk shell mounts it), and the button already names
  // itself with aria-label, so the nav gets the plain trigger rather than a tooltip it cannot render.
  const menuTrigger =
    compact && tone !== "nav" ? (
      <Tip label={`Colour theme: ${current.label}`}>
        <DropdownMenu.Trigger asChild>{triggerButton}</DropdownMenu.Trigger>
      </Tip>
    ) : (
      <DropdownMenu.Trigger asChild>{triggerButton}</DropdownMenu.Trigger>
    );

  return (
    // Non-modal: a menu is a utility, not a gate. A modal one marks the rest of the page
    // `aria-hidden` the moment it opens, which React reports as a hydration mismatch if the click
    // landed before the page finished hydrating. Escape and an outside click still close it.
    <DropdownMenu.Root modal={false}>
      {menuTrigger}
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={tone === "rail" ? "right" : tone === "nav" ? "bottom" : "top"}
          align={tone === "rail" || tone === "nav" ? "end" : "start"}
          sideOffset={8}
          collisionPadding={12}
          className="on-surface z-50 min-w-[12rem] rounded-[12px] border border-line bg-surface p-1 shadow-lift outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <DropdownMenu.RadioGroup
            value={choice}
            onValueChange={(value) => pick(value as ThemeChoice)}
          >
            {THEME_CHOICES.map((c) => (
              <DropdownMenu.RadioItem
                key={c.id}
                value={c.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink outline-none data-[highlighted]:bg-surface-sunken"
              >
                <c.icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="flex-1">{c.label}</span>
                <DropdownMenu.ItemIndicator>
                  <Check className="size-4 text-gold" aria-hidden="true" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
