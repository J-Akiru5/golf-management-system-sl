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
  className,
}: {
  tone?: "default" | "on-forest";
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
        className={cn(
          "!h-11 !w-auto !px-2.5 text-[13px] font-medium",
          tone === "on-forest" &&
            "!border-on-forest-muted !bg-transparent !text-on-forest focus-visible:!outline-gold",
        )}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} className="text-ink">
            {LOCALE_LABEL[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
