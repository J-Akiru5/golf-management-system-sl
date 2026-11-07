import { getI18n } from "@/lib/i18n/server";

/**
 * The shape of the pairings page while it loads: the same header block, the sticky toolbar and the
 * same time-first cards, so the page does not jump when the real draw arrives. No spinner, because
 * the page is already drawing its own outline.
 */
export default async function LoadingPairings() {
  const { t } = await getI18n();
  const bar = "rounded bg-surface-sunken";
  const onForest = "rounded bg-on-forest/20";

  return (
    <main className="public public-pairings mobile-bar-space" aria-busy="true">
      <p className="sr-only" role="status">
        {t("pairings.loading")}
      </p>

      <header className="public-head">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className={`h-8 w-[172px] max-w-[60%] ${onForest}`} />
            <div className="grid gap-1.5">
              <div className={`h-3 w-28 ${onForest}`} />
              <div className={`h-3 w-24 ${onForest}`} />
            </div>
          </div>
          <div className={`h-11 w-32 ${onForest}`} />
        </div>
        <div className={`mt-3 h-3 w-40 max-w-[60%] ${onForest}`} />
        <div className={`h-8 w-4/5 max-w-md ${onForest}`} />
        <div className={`h-4 w-1/2 max-w-[12rem] ${onForest}`} />
      </header>

      <div className="p-pairings" aria-hidden="true">
        <div className="p-toolbar">
          <div className="p-toolbar-row">
            <div className={`h-11 flex-1 ${bar}`} />
            <div className={`h-11 w-32 ${bar}`} />
          </div>
          <div className="p-toolbar-meta">
            <div className={`h-4 w-24 ${bar}`} />
          </div>
        </div>
        <div className="p-list">
          <div className="p-session">
            <div className={`h-6 w-28 ${bar}`} />
            <div className="p-groups">
              {[0, 1, 2].map((card) => (
                <article key={card} className="p-card">
                  <div className="p-card-top">
                    <div className={`h-7 w-28 ${bar}`} />
                    <div className={`h-6 w-16 rounded-full ${bar}`} />
                  </div>
                  <ul className="p-players">
                    {[0, 1, 2, 3].map((row) => (
                      <li key={row} className="p-row">
                        <div className={`size-9 shrink-0 rounded-full ${bar}`} />
                        <div className={`h-4 w-32 max-w-[9rem] ${bar}`} />
                      </li>
                    ))}
                  </ul>
                  <div className="p-card-foot">
                    <div className={`h-5 w-16 rounded-full ${bar}`} />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
