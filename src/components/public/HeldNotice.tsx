"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";

/**
 * The public answer when the event is published but the organizer has not released this section.
 * It is deliberately different from "not published yet": the event exists, the section is held.
 */
export function HeldNotice({
  compact = false,
  testId = "held-notice",
}: {
  compact?: boolean;
  testId?: string;
}) {
  const { t } = useI18n();

  if (compact) {
    return (
      <div className="notice" role="status" data-testid={testId}>
        <p className="m-0 flex items-start gap-2">
          <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <b>{t("release.heldTitle")}</b> {t("release.heldBody")}
          </span>
        </p>
      </div>
    );
  }

  return (
    <section className="pairings-empty" role="status" data-testid={testId}>
      <LockKeyhole className="mx-auto mb-2 size-7 text-ink-muted" aria-hidden="true" />
      <h2>{t("release.heldTitle")}</h2>
      <p>{t("release.heldBody")}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <a className="btn ghost no-print" href="">
          {t("pairings.checkAgain")}
        </a>
        <Link className="btn ghost no-print" href="/">
          {t("pairings.home")}
        </Link>
      </div>
    </section>
  );
}
