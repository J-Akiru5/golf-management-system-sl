import Link from "next/link";
import { DashboardHero } from "@/components/player/DashboardHero";
import { DesktopQuickLinks } from "@/components/player/desktop/DesktopQuickLinks";
import { EntryCard } from "@/components/player/PortalView";
import { fmtTime } from "@/lib/format";
import { LOCALE_LABEL, type Locale } from "@/lib/i18n/locales";
import type { Translate } from "@/lib/i18n/t";
import { claimPlayerRecord } from "@/lib/player/actions";
import { nextUp } from "@/lib/player/dashboard";
import { type PortalState, startLabel } from "@/lib/player/portal";

export interface PlayerHomeDesktopProps {
  t: Translate;
  state: PortalState;
  notice: string | null;
  linkedMessage: string | null;
  /** ISO day in Manila time, which is the club's day, not the phone's. */
  today: string;
  /** Pre-filled NGAP from a scorecard QR link. */
  defaultNgap: string;
  locale: Locale;
  demo?: boolean;
}

/** "You play today · IGCC Monthly Medal · Hole 10A · 6:30 AM". */
function statusLine(state: PortalState, next: ReturnType<typeof nextUp>, t: Translate): string {
  if (!state.linked) return t("home.desktop.statusUnlinked");
  if (!next) return t("home.desktop.statusNone");

  const label =
    next.when === "today"
      ? t("home.desktop.statusToday")
      : next.when === "upcoming"
        ? t("home.desktop.statusNext")
        : t("home.desktop.statusLast");

  return `${label} · ${next.entry.eventName} · ${startLabel(next.entry, t, fmtTime)}`;
}

function LinkRecordCard({
  t,
  notice,
  defaultNgap,
}: {
  t: Translate;
  notice: string | null;
  defaultNgap: string;
}) {
  return (
    <section className="card ph-link-card" aria-labelledby="link-h" data-help="my-claim">
      <div className="ph-link-forms">
        <h2 id="link-h" className="ph-card-title">
          {t("home.desktop.linkTitle")}
        </h2>
        <p className="ph-hint">{t("home.desktop.linkBody")}</p>

        {notice && (
          <p className="notice bad" role="alert">
            {notice}
          </p>
        )}

        {/* The account's own verified email is the first proof: no NGAP number needed when the club
            already holds that address on the record. The database makes the match. */}
        <form action={claimPlayerRecord} className="ph-claim-form">
          <button type="submit" className="btn">
            {t("player.claim.emailSubmit")}
          </button>
          <p className="ph-hint">{t("player.claim.emailBody")}</p>
        </form>

        <div className="ph-divider">
          <p className="overline">{t("home.desktop.linkNgapTitle")}</p>
          <form action={claimPlayerRecord} className="ph-claim-form">
            <label className="field">
              <span>{t("player.claim.ngapId")}</span>
              <input
                name="ngapId"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={defaultNgap}
              />
            </label>
            <label className="field">
              <span>{t("player.claim.birthdate")}</span>
              <input name="birthdate" type="date" autoComplete="bday" />
            </label>
            <p className="ph-hint">{t("player.claim.help")}</p>
            <button type="submit" className="btn">
              {t("player.claim.submit")}
            </button>
          </form>
        </div>
      </div>

      {/* Wide screens get the "why" beside the form instead of a card stretched across the column.
          The status line already says this on a phone, so it is not repeated there. */}
      <aside className="ph-link-aside">
        <p className="ph-note-text">{t("player.claim.notLinked")}</p>
      </aside>
    </section>
  );
}

/**
 * The player home on a wide screen: the record and the round on the left, the four destinations and
 * the profile on the right. The columns are CSS only, so the same markup stacks into one clean
 * column on a phone.
 */
export function PlayerHomeDesktop({
  t,
  state,
  notice,
  linkedMessage,
  today,
  defaultNgap,
  locale,
  demo = false,
}: PlayerHomeDesktopProps) {
  const next = nextUp(state.entries, today);

  return (
    <div className="ph">
      <header className="ph-head">
        <h1 className="ph-title">{t("home.title")}</h1>
        <p className="ph-sub">{t("home.desktop.subtitle")}</p>
        <p className="ph-status">
          <span className="ph-dot" aria-hidden="true" />
          {statusLine(state, next, t)}
        </p>
      </header>

      {demo && (
        <p className="ph-hint ph-demo" role="status">
          {t("home.desktop.demo")}
        </p>
      )}

      <div className="ph-grid">
        <div className="ph-main">
          {!state.linked || !state.player ? (
            <LinkRecordCard t={t} notice={notice} defaultNgap={defaultNgap} />
          ) : (
            <div className="grid gap-4">
              {linkedMessage && (
                <p className="notice ok" role="status">
                  {linkedMessage}
                </p>
              )}
              {next && <DashboardHero next={next} t={t} />}
              {state.entries.length === 0 ? (
                <p className="notice" role="status">
                  {t("player.noEntries")}
                </p>
              ) : (
                <div className="grid gap-4">
                  {state.entries.map((entry) => (
                    <EntryCard key={entry.tournamentId} entry={entry} t={t} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="ph-side">
          <section className="card ph-quick" aria-labelledby="quick-h">
            <h2 id="quick-h" className="ph-card-title">
              {t("home.desktop.quickTitle")}
            </h2>
            <DesktopQuickLinks t={t} />
          </section>

          <section className="card ph-profile" aria-labelledby="ph-profile-h">
            <h2 id="ph-profile-h" className="ph-card-title">
              {t("home.desktop.profileTitle")}
            </h2>
            {state.linked && state.player && (
              <p className="ph-profile-name">
                <b>{state.player.name}</b>
              </p>
            )}
            {state.linked && state.player && (
              <p className="ph-hint">
                {state.player.ngapId
                  ? `NGAP ${state.player.ngapId}`
                  : t("home.desktop.profileNoNgap")}
              </p>
            )}
            <p className="ph-hint">
              {t("home.desktop.languageLabel")} · {LOCALE_LABEL[locale]}
            </p>
            <Link href="/my/profile" className="btn ghost ph-profile-cta">
              {t("home.desktop.profileAction")}
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
