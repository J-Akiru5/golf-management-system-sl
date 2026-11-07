import { ClipboardList, List, Map, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/bits";
import { PlayerPageHeader } from "@/components/player/PlayerPageHeader";
import { SignOutForm } from "@/components/SignOutForm";
import { loadPublicPhotos } from "@/lib/data/public-results";
import { getI18n } from "@/lib/i18n/server";
import { publicPhotoUrl } from "@/lib/photo";
import { loadPortal } from "@/lib/player/portal";
import { signedInClient } from "@/lib/player/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

/**
 * Who the account is in the club's books. A photo is shown only from the public bucket, which the
 * club fills for players who agreed to a public copy; the private photo never reaches this page.
 */
export default async function PlayerProfilePage() {
  const { t } = await getI18n();

  if (!isSupabaseConfigured()) {
    return (
      <div className="grid gap-4">
        <h1 className="font-serif text-[30px] leading-9 font-semibold">
          {t("player.profile.title")}
        </h1>
        <p className="notice" role="status">
          {t("player.demo.body")}
        </p>
      </div>
    );
  }

  const client = await signedInClient("/my/profile");
  const portal = await loadPortal(client);
  if (!portal.linked || !portal.player) redirect("/my");

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
      <PlayerPageHeader title={t("player.profile.title")} />

      <section className="card grid gap-4" aria-labelledby="profile-h">
        <div className="flex items-center gap-3">
          <Avatar name={player.name} photo={photo} large />
          <div className="grid gap-0.5">
            <h2 id="profile-h" className="text-[18px] leading-6">
              {player.name}
            </h2>
            <p className="hint">
              {player.ngapId
                ? `${t("player.profile.ngap")} ${player.ngapId}`
                : t("player.profile.noNgap")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-0.5">
            <span className="small-h">{t("player.profile.entries")}</span>
            <span className="font-semibold tnum">{portal.entries.length}</span>
          </div>
          <div className="grid gap-0.5">
            <span className="small-h">{t("player.profile.photo")}</span>
            <span className="font-semibold">
              {photo ? t("player.profile.photoYes") : t("player.profile.noPhoto")}
            </span>
          </div>
        </div>

        <p className="hint">{t("player.profile.photoNote")}</p>
        <p className="hint">{t("player.profile.linked")}</p>
      </section>

      <nav aria-label={t("player.app.tiles")} className="app-tiles">
        {links.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="app-tile no-underline">
            <Icon className="size-[18px]" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <SignOutForm className="btn ghost justify-self-start" />
    </div>
  );
}
