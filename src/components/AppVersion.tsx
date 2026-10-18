import { cn } from "@/lib/ui/cn";
import { APP_VERSION_LABEL } from "@/lib/version";

/** The build's version, small and selectable, so a tester can copy it onto the acceptance form. */
export function AppVersion({ className }: { className?: string }) {
  return (
    <p className={cn("text-[11px] text-ink-muted select-all", className)} data-testid="app-version">
      {APP_VERSION_LABEL}
    </p>
  );
}
