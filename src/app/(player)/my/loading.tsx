import { getI18n } from "@/lib/i18n/server";

/**
 * The shape of the home page while the player's record loads: the hero card, then two entry cards.
 * It mirrors the real blocks so nothing jumps when the data lands.
 */
export default async function LoadingMyGolf() {
  const { t } = await getI18n();
  return (
    <div className="grid gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t("player.home.loading")}</span>
      <div className="grid gap-2">
        <span className="skeleton h-3 w-24" />
        <span className="skeleton h-7 w-52" />
      </div>
      <div className="skeleton h-[286px] w-full rounded-[18px]" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <span className="skeleton h-12 w-full rounded-[10px]" />
        <span className="skeleton h-12 w-full rounded-[10px]" />
        <span className="skeleton h-12 w-full rounded-[10px]" />
        <span className="skeleton h-12 w-full rounded-[10px]" />
      </div>
      <div className="grid gap-2">
        <span className="skeleton h-6 w-36" />
        <div className="skeleton h-40 w-full rounded-[14px]" />
      </div>
    </div>
  );
}
