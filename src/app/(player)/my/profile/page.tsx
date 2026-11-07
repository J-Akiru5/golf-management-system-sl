import { ClipboardList, List, Map, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/bits";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { TextSizeToggle } from "@/components/player/TextSizeToggle";
import { SignOutForm } from "@/components/SignOutForm";
import { loadPublicPhotos } from "@/lib/data/public-results";
import { getI18n } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/t";
import { publicPhotoUrl } from "@/lib/photo";
import { demoPortalState } from "@/lib/player/demo";
import { loadPortal } from "@/lib/player/portal";
import { signedInClient } from "@/lib/player/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

/** Language and larger type, on every version of Me, including before a record is linked. */
function SettingsCard({ t }: { t: Translate }) {
  return (
    <div className="card grid gap-2">
      <div
        className="flex min-h-11 flex-wrap items-center justify-between gap-2"
        data-onboard="profile-language"
      >
        <span className="small-h">{t("common.language")}</span>
        <LanguageSwitcher />
      </div>
      <div className="flex min-h-11 items-center border-t border-line pt-2">
        <TextSizeToggle className="min-h-11 w-full justify-start" />
      </div>
    </div>
  );
}


/**
 * Who the account is in the club's books. A photo is shown only from the public bucket, which the
 * club fills for players who agreed to a public copy; the private photo never reaches this page.
 *
 * This build has no player-write server action, so the page shows what the club holds and points
 * to the desk instead of offering an edit form that could not save.
 */
export default async function PlayerProfilePage() {
  const { t } = await getI18n();

  if (!isSupabaseConfigured()) {
    const sample = demoPortalState();
    return (
      <div className="grid gap-4">
        <h1 className="font-serif text-[26px] leading-8 font-semibold sm:text-[30px] sm:leading-9">
          {t("player.profile.title")}
        </h1>
        <section className="card grid gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={sample.player?.name ?? "Player"} large />
            <div className="grid min-w-0 flex-1 gap-0.5">
              <h2 className="text-[18px] leading-6 break-words">{sample.player?.name}</h2>
              <p className="hint">
                {t("player.profile.ngap")} {sample.player?.ngapId}
              </p>
            </div>
          </div>
        </section>
        <p className="notice" role="status">
          {t("player.demo.body")}{" "}
          <Link href="/pairings" className="font-semibold underline">
            {t("player.demo.link")}
          </Link>
          .
        </p>
        <SettingsCard t={t} />
      </div>
    );
  }

  const client = await signedInClient("/my/profile");
  const portal = await loadPortal(client);

  if (!portal.linked || !portal.player) {
    // Me is where the language, the type size and sign-out live, so it stays open even before the
    // club has linked a record. Linking stays on My golf, where the claim card explains it.
    return (
      <div className="grid gap-4">
        <h1 className="font-serif text-[26px] leading-8 font-semibold sm:text-[30px] sm:leading-9">
          {t("player.profile.title")}
        </h1>
        <section className="card grid gap-2" aria-labelledby="profile-h">
          <h2 id="profile-h" className="text-[18px]">
            {t("player.claim.heading")}
          </h2>
          <p className="hint">{t("player.claim.notLinked")}</p>
          <Link href="/my" className="btn ghost min-h-11 justify-self-start no-underline">
            {t("player.title")}
          </Link>
        </section>
        <SettingsCard t={t} />
        <SignOutForm
          className="btn ghost min-h-11 w-full justify-center sm:w-auto"
          label={t("player.nav.signOut")}
        />
      </div>
    );
  }

  const player = portal.player;
  let photo: string | undefined;
  try {
    const photos = await loadPublicPhotos(client, [player.id]);
    photo = publicPhotoUrl(photos[player.id]);
  } catch {
    photo = undefined;
  }

  const links = [
    { href: "/my/board", label: t("player.app.openBoard"), Icon: Trophy },
    { href: "/my/card", label: t("player.app.openCard"), Icon: ClipboardList },
    { href: "/my/course", label: t("player.app.openCourse"), Icon: Map },
    { href: "/pairings", label: t("player.app.openPairings"), Icon: List },
  ];

  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-[26px] leading-8 font-semibold sm:text-[30px] sm:leading-9">
        {t("player.profile.title")}
      </h1>

      <section className="card grid gap-4" aria-labelledby="profile-h">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={player.name} photo={photo} large />
          <div className="grid min-w-0 flex-1 gap-0.5">
            <h2 id="profile-h" className="text-[18px] leading-6 break-words">
              {player.name}
            </h2>
          </div>
        </div>

        {/* What the club holds. Read-only: the desk owns the member record in this build. */}
        <dl className="m-0 grid gap-2 border-t border-line pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="small-h">{t("player.profile.ngap")}</dt>
            <dd
              className={`m-0 min-w-0 text-right text-[14px] break-words ${
                player.ngapId ? "font-semibold tnum" : "text-ink-muted"
              }`}
            >
              {player.ngapId ?? t("player.profile.noNgap")}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="small-h">{t("player.profile.entries")}</dt>
            <dd className="m-0 text-right text-[14px] font-semibold tnum">
              {portal.entries.length}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="small-h">{t("player.profile.photo")}</dt>
            <dd className="m-0 min-w-0 text-right text-[14px] font-medium">
              {photo ? t("player.profile.photoYes") : t("player.profile.noPhoto")}
            </dd>
          </div>
        </dl>

        <p className="hint">{t("player.profile.photoNote")}</p>
        <p className="hint">{t("player.profile.linked")}</p>
      </section>

      <nav aria-label={t("player.app.tiles")} className="app-tiles">
        {links.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="app-tile no-underline">
            <Icon className="size-[18px] shrink-0" aria-hidden="true" />
            <span className="min-w-0">{label}</span>
          </Link>
        ))}
      </nav>

      {/* Both controls are 44px rows; the language row carries the onboarding anchor. */}
      <SettingsCard t={t} />

      <SignOutForm
        className="btn ghost min-h-11 w-full justify-center sm:w-auto"
        label={t("player.nav.signOut")}
      />
    </div>
  );
}
