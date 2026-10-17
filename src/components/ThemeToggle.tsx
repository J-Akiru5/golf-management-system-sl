"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Tip } from "@/components/ui/tooltip";

export type ThemeChoice = "auto" | "light" | "dark";
export const THEME_KEY = "starter-theme";

/** Runs before first paint (see layout.tsx) so a saved choice never flashes the wrong theme. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const CHOICES: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { id: "auto", label: "Auto", icon: Monitor },
  { id: "light", label: "Ivory", icon: Sun },
  { id: "dark", label: "Charcoal", icon: Moon },
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
}

/**
 * Ivory (light), Charcoal (dark) or follow the device. Remembered per browser; storage is only a
 * convenience. `compact` is one button that cycles, for the rail.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [choice, setChoice] = useState<ThemeChoice>("auto");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") setChoice(saved);
    } catch {
      // Storage unavailable: stay on Auto.
    }
  }, []);

  const pick = (c: ThemeChoice) => {
    setChoice(c);
    apply(c);
  };

  if (compact) {
    const i = CHOICES.findIndex((c) => c.id === choice);
    const current = CHOICES[i] ?? CHOICES[0];
    const next = CHOICES[(i + 1) % CHOICES.length] ?? CHOICES[0];
    if (!current || !next) return null;
    const Icon = current.icon;
    return (
      <Tip label={`Theme: ${current.label}. Switch to ${next.label}`}>
        <button
          type="button"
          onClick={() => pick(next.id)}
          aria-label={`Theme: ${current.label}. Switch to ${next.label}`}
          className="grid size-11 place-items-center rounded-full text-on-forest-muted hover:bg-[rgba(238,240,234,0.1)] hover:text-on-forest"
        >
          <Icon className="size-[18px]" aria-hidden="true" />
        </button>
      </Tip>
    );
  }

  return (
    <div className="seg" role="group" aria-label="Colour theme">
      {CHOICES.map((c) => (
        <button key={c.id} type="button" aria-pressed={choice === c.id} onClick={() => pick(c.id)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}
