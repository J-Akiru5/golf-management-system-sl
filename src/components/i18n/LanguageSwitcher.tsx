"use client";

import { Check, ChevronDown, Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
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

  /* The menu is drawn by the page instead of the browser, so it can carry the masthead's own
     colours rather than the system listbox, and it renders through a portal because the dark band
     clips anything positioned inside it. */
  const dark = tone === "on-forest";
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={t("common.language")}
          className={cn(
            "lang-menu-btn inline-flex h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold",
            dark
              ? "border border-[rgba(247,245,238,0.38)] bg-[rgba(247,245,238,0.07)] text-[#f7f5ee] hover:bg-[rgba(247,245,238,0.14)]"
              : "border border-line bg-surface-raised text-ink hover:bg-surface-sunken",
            className,
          )}
        >
          <Languages className="size-[18px] shrink-0" aria-hidden="true" />
          <span>{LOCALE_LABEL[locale]}</span>
          <ChevronDown className="size-4 shrink-0 opacity-80" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            "z-50 min-w-[13rem] rounded-2xl border p-1.5 shadow-2xl outline-none",
            dark
              ? "border-[rgba(247,245,238,0.18)] bg-[#07352a] text-[#f7f5ee]"
              : "border-line bg-surface text-ink",
          )}
        >
          <DropdownMenu.RadioGroup value={locale} onValueChange={(value) => choose(value)}>
            {LOCALES.map((code) => (
              <DropdownMenu.RadioItem
                key={code}
                value={code}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm outline-none",
                  dark
                    ? "data-[highlighted]:bg-[rgba(247,245,238,0.1)]"
                    : "data-[highlighted]:bg-surface-sunken",
                )}
              >
                <span className="flex-1">{LOCALE_LABEL[code]}</span>
                <DropdownMenu.ItemIndicator>
                  <Check
                    className={cn("size-4", dark ? "text-[var(--gold-on-forest)]" : "text-gold")}
                    aria-hidden="true"
                  />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
