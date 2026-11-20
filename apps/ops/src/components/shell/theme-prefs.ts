/**
 * Theme preference, kept apart from the toggle component so the server layout can inline the boot
 * script without importing a client module.
 */
export type ThemeChoice = "auto" | "light" | "dark";

export const THEME_KEY = "teeline-ops-theme";

export const THEME_CHOICES: ReadonlyArray<{ id: ThemeChoice; label: string }> = [
  { id: "auto", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/** Only an explicit light or dark is a choice; everything else is System. */
export function parseTheme(value: string | null | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "auto";
}

/**
 * Runs before the first paint, so a saved choice never flashes the other theme. Inline, bundled
 * with the page: no external script.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
