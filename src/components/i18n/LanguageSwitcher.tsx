"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { isLocale, LOCALE_COOKIE, LOCALE_LABEL, LOCALES } from "@/lib/i18n/locales";
import { cn } from "@/lib/ui/cn";

/**
 * The language picker. The choice is written to a cookie and the page is refreshed, so the server
 * renders the new language straight away instead of the client patching text after the fact.
 *
 * `tone="on-forest"` is for the dark band at the top of the player pages, where the default input
 * colours would be ivory on ivory.
 */
export function LanguageSwitcher({
  tone = "default",
  compact = false,
  className,
}: {
  tone?: "default" | "on-forest";
  /** A globe and the language code in a 44px target; the native picker opens on tap. */
  compact?: boolean;
  className?: string;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();

  const choose = (value: string) => {
    if (!isLocale(value)) return;
    try {
      document.cookie = `${LOCALE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // A browser that refuses cookies still gets the choice for this page: the refresh below
      // keeps the Accept-Language value, so the visitor simply stays on the previous locale.
    }
    router.refresh();
  };

  if (compact) {
    // The visible part is the globe and the code; the real select sits over it, invisible, so a
    // tap anywhere on the control opens the phone's own picker.
    return (
      <label
        className={cn(
          "relative inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-3 text-xs font-bold tracking-wide uppercase focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]",
          tone === "on-forest"
            ? "border border-[rgba(238,240,234,0.25)] text-on-forest"
            : "border border-line text-ink",
          className,
        )}
      >
        <Languages className="size-4 shrink-0" aria-hidden="true" />
        <span aria-hidden="true">{locale}</span>
        <span className="sr">{t("common.language")}</span>
        <select
          value={locale}
          onChange={(event) => choose(event.target.value)}
          aria-label={t("common.language")}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        >
          {LOCALES.map((code) => (
            <option key={code} value={code}>
              {LOCALE_LABEL[code]}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className={cn("inline-flex min-h-11 items-center gap-2", className)}>
      <Languages
        className={cn(
          "size-4 shrink-0",
          tone === "on-forest" ? "text-on-forest-muted" : "text-ink-muted",
        )}
        aria-hidden="true"
      />
      <span className="sr">{t("common.language")}</span>
      <select
        value={locale}
        onChange={(event) => choose(event.target.value)}
        aria-label={t("common.language")}
        className={cn("font-medium", tone === "on-forest" && "lang-select")}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABEL[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
