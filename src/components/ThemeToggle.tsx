"use client";

import { useEffect, useState } from "react";

export type ThemeChoice = "auto" | "light" | "dark";
export const THEME_KEY = "starter-theme";

/** Runs before first paint (see layout.tsx) so a saved choice never flashes the wrong theme. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const CHOICES: { id: ThemeChoice; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
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

/** Light, dark or follow the device. Remembered per browser; storage is only a convenience. */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("auto");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") setChoice(saved);
    } catch {
      // Storage unavailable: stay on Auto.
    }
  }, []);

  return (
    <div className="seg" role="group" aria-label="Colour theme">
      {CHOICES.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={choice === c.id}
          onClick={() => {
            setChoice(c.id);
            apply(c.id);
          }}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
