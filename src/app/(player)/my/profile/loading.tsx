import { getI18n } from "@/lib/i18n/server";

/**
 * The profile while its four reads land (the record, the public photo, the account email and the
 * portal). It is the same `.pf` frame as the real screen — back link, heading, then the card column
 * — so the page does not reflow when the data arrives, and a slow club connection shows a shape
 * instead of a blank panel.
 */
export default async function ProfileLoading() {
  const { t } = await getI18n();
  return (
    <div className="pf" aria-busy="true" aria-live="polite" data-testid="profile-skeleton">
      <span className="sr-only">{t("profile.loading")}</span>
      <div className="pf-head" aria-hidden="true">
        <span className="skeleton h-11 w-20" />
        <span className="skeleton mt-2 h-3 w-24" />
        <span className="skeleton mt-2 h-8 w-44" />
        <span className="skeleton mt-2 h-3 w-full max-w-[52ch]" />
      </div>
      <div className="pf-layout" aria-hidden="true">
        <div className="pf-main">
          {[0, 1, 2].map((card) => (
            <div key={card} className="skeleton h-[188px] w-full rounded-[18px]" />
          ))}
        </div>
        <div className="pf-side">
          <div className="skeleton h-[148px] w-full rounded-[18px]" />
          <div className="skeleton h-[132px] w-full rounded-[18px]" />
        </div>
      </div>
    </div>
  );
}
