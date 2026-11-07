import type { Metadata } from "next";
import Link from "next/link";
import { PlayerMap } from "@/components/player/PlayerMap";
import { COURSE_IS_PLACEHOLDER } from "@/lib/course/layout";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Course map" };

/**
 * The club's only course today. The drawing is the same illustration the desk uses, and it says so:
 * the club is still confirming hole numbering and positions, so nothing here is presented as the
 * survey. Par and stroke index are left out for the same reason.
 */
export default async function PlayerCoursePage() {
  const { t } = await getI18n();

  return (
    <div className="grid gap-4">
      <header className="grid gap-1">
        <p className="overline">{t("player.course.subtitle")}</p>
        <h1 className="font-serif text-[30px] leading-9 font-semibold">
          {t("player.course.title")}
        </h1>
      </header>

      {COURSE_IS_PLACEHOLDER && (
        <p className="notice warn" role="note">
          {t("player.course.placeholder")}
        </p>
      )}

      <PlayerMap />

      <p className="hint">{t("player.course.numbersOnly")}</p>
      <p className="hint">
        <Link
          href="/pairings"
          className="inline-flex min-h-11 items-center font-semibold underline"
        >
          {t("player.app.openPairings")}
        </Link>
      </p>
    </div>
  );
}
