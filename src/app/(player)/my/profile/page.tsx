import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/bits";
import { ContactForm } from "@/components/player/profile/ContactForm";
import { LanguageList } from "@/components/player/profile/LanguageList";
import { ProfileCard, ProfileFact } from "@/components/player/profile/ProfileSections";
import { SignOutForm } from "@/components/SignOutForm";
import { loadPublicPhotos } from "@/lib/data/public-results";
import { fmtIndex, shortDate } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/t";
import { publicPhotoUrl } from "@/lib/photo";
import type { PortalEntry } from "@/lib/player/portal";
import { loadPortal } from "@/lib/player/portal";
import {
  demoOwnProfile,
  indexFromEntries,
  mapOwnProfile,
  type OwnProfile,
} from "@/lib/player/profile";
import { signedInClient } from "@/lib/player/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

/** The membership word for the record card. Membership is the club's, so it is never edited here. */
function membershipLabel(t: Translate, type: OwnProfile["membership"]["type"]): string {
  if (type === "member") return t("profile.identity.member");
  if (type === "guest") return t("profile.identity.guest");
  return t("profile.identity.membershipMissing");
}

/** The record the page can build while the profile migration is not applied yet. */
function recordFromPortal(
  player: { id: string; name: string; ngapId: string | null },
  entries: readonly PortalEntry[],
): OwnProfile {
  const last = indexFromEntries(entries);
  return {
    linked: true,
    player: { id: player.id, name: player.name, ngapId: player.ngapId },
    contact: { phone: "", email: "", nickname: "" },
    handicap: {
      index: last?.index ?? null,
      effectiveDate: last?.effectiveDate ?? null,
    },
    membership: { type: null, memberNumber: null },
    clubName: null,
    photo: { private: false, public: false, publicConsentAt: null },
  };
}

/**
 * The page itself. The record comes from the club, the contact details are the player's to change,
 * and the photo card only ever talks about the public copy: the private one never leaves the desk.
 */
function ProfileScreen({
  t,
  profile,
  photoUrl,
  accountEmail,
  readOnly,
  demo,
}: {
  t: Translate;
  profile: OwnProfile;
  photoUrl: string | undefined;
  accountEmail: string | null;
  readOnly: boolean;
  demo: boolean;
}) {
  const asOf = shortDate(profile.handicap.effectiveDate);
  const publicDate = profile.photo.public ? shortDate(profile.photo.publicConsentAt) : null;

  return (
    <div className="pf">
      <header className="pf-head">
        <Link href="/my" className="pf-back">
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t("profile.back")}
        </Link>
        <p className="overline">{t("home.title")}</p>
        <h1 className="pf-title">{t("profile.title")}</h1>
        <p className="pf-sub">{t("profile.subtitle")}</p>
      </header>

      {demo && (
        <p className="notice" role="status">
          {t("profile.demoNotice")}
        </p>
      )}

      <div className="pf-layout">
        <div className="pf-main">
          <ProfileCard
            id="profile-identity"
            title={t("profile.identity.title")}
            body={t("profile.identity.body")}
          >
            <dl className="pf-facts">
              <ProfileFact term={t("profile.identity.name")}>{profile.player.name}</ProfileFact>
              <ProfileFact term={t("profile.identity.ngap")}>
                {profile.player.ngapId ?? t("profile.identity.ngapMissing")}
              </ProfileFact>
              <ProfileFact term={t("profile.identity.index")}>
                {profile.handicap.index === null ? (
                  t("profile.identity.indexMissing")
                ) : (
                  <>
                    <span className="tnum">{fmtIndex(profile.handicap.index)}</span>
                    {asOf && (
                      <span className="pf-fact-note">
                        {t("profile.identity.indexAsOf", { date: asOf })}
                      </span>
                    )}
                  </>
                )}
              </ProfileFact>
              <ProfileFact term={t("profile.identity.membership")}>
                {membershipLabel(t, profile.membership.type)}
              </ProfileFact>
              <ProfileFact term={t("profile.identity.club")}>
                {profile.clubName ?? t("profile.identity.clubMissing")}
              </ProfileFact>
            </dl>
            <div className="pf-note">
              <p>{t("profile.identity.note")}</p>
              <b>{t("profile.identity.askDesk")}</b>
            </div>
          </ProfileCard>

          <ProfileCard
            id="profile-contact"
            title={t("profile.contact.title")}
            body={t("profile.contact.body")}
          >
            <ContactForm current={profile.contact} readOnly={readOnly} />
          </ProfileCard>

          <ProfileCard
            id="profile-photo"
            title={t("profile.photo.title")}
            body={t("profile.photo.body")}
          >
            {photoUrl && <Avatar name={profile.player.name} photo={photoUrl} large />}
            <dl className="pf-facts">
              <ProfileFact term={t("profile.photo.onRecord")}>
                {profile.photo.private
                  ? t("profile.photo.onRecordYes")
                  : t("profile.photo.onRecordNo")}
              </ProfileFact>
              <ProfileFact term={t("profile.photo.publicCopy")}>
                {publicDate
                  ? t("profile.photo.publicYes", { date: publicDate })
                  : t("profile.photo.publicNo")}
              </ProfileFact>
            </dl>
            <p className="pf-hint">{t("profile.photo.neverPrivate")}</p>
            <div className="pf-note">
              <p>{t("profile.photo.withdraw")}</p>
              <b>{t("profile.photo.askDesk")}</b>
            </div>
          </ProfileCard>
        </div>

        <aside className="pf-side">
          <ProfileCard
            id="profile-language"
            title={t("profile.language.title")}
            body={t("profile.language.body")}
          >
            <LanguageList />
          </ProfileCard>

          <ProfileCard id="profile-account" title={t("profile.account.title")}>
            <p className="pf-hint">
              {accountEmail
                ? t("profile.account.signedInAs", { email: accountEmail })
                : t("profile.account.signedIn")}
            </p>
            {demo ? (
              <p className="pf-hint">{t("profile.account.demo")}</p>
            ) : (
              <SignOutForm className="btn pf-save" label={t("profile.account.signOut")} />
            )}
            <Link href="/my?onboarding=1" className="btn ghost pf-save">
              {t("profile.account.tour")}
            </Link>
            <p className="pf-hint">{t("profile.account.tourHint")}</p>
          </ProfileCard>
        </aside>
      </div>
    </div>
  );
}

/**
 * The player's own profile. Everything on it is theirs to read; only the three contact details are
 * theirs to write, and the database refuses to write anything else.
 *
 * The public photo is fetched through the public function, which only answers for players who agreed
 * to a public copy. The private path is never requested here.
 */
export default async function PlayerProfilePage() {
  const { t } = await getI18n();

  if (!isSupabaseConfigured()) {
    return (
      <ProfileScreen
        t={t}
        profile={demoOwnProfile}
        photoUrl={undefined}
        accountEmail={null}
        readOnly
        demo
      />
    );
  }

  const client = await signedInClient("/my/profile");
  const portal = await loadPortal(client);
  if (!portal.linked || !portal.player) redirect("/my");

  const player = portal.player;

  // A failed read is not a broken page: the portal already knows the name, the NGAP number and the
  // index it last used, so the record card still shows real data.
  let profile: OwnProfile | null = null;
  try {
    const { data } = await client.rpc("player_own_profile");
    profile = mapOwnProfile(data);
  } catch {
    profile = null;
  }

  if (!profile) profile = recordFromPortal(player, portal.entries);

  const photos = await loadPublicPhotos(client, [player.id]).catch(
    (): Record<string, string> => ({}),
  );
  const photoUrl = publicPhotoUrl(photos[player.id]);

  const { data: auth } = await client.auth.getUser();
  const accountEmail = auth.user?.email ?? null;

  return (
    <ProfileScreen
      t={t}
      profile={profile}
      photoUrl={photoUrl}
      accountEmail={accountEmail}
      readOnly={false}
      demo={false}
    />
  );
}
