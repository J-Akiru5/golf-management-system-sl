import Link from "next/link";
import { redirect } from "next/navigation";
import { AppTiles, DashboardHero } from "@/components/player/DashboardHero";
import { PlayerOfflineNotice, RememberPortal } from "@/components/player/OfflinePortal";
import { PortalEntries } from "@/components/player/PortalView";
import { getI18n } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/t";
import { claimPlayerRecord } from "@/lib/player/actions";
import { claimMessage } from "@/lib/player/claim";
import { manilaToday, nextUp } from "@/lib/player/dashboard";
import { loadPortal, type PortalState, portalErrorMessage } from "@/lib/player/portal";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("player.title") };
}

/** The claim codes the page can be sent back with, in the reader's language. */
const claimNotice = (t: Translate, code: string): { tone: "ok" | "bad"; text: string } | null => {
  if (code === "linked") return { tone: "ok", text: t("player.claim.linked") };
  if (code === "start") return null;
  if (code === "not_ready") return { tone: "bad", text: t("player.claim.notReady") };
  if (code === "failed") return { tone: "bad", text: t("player.claim.failed") };
  const message = claimMessage(t, code);
  return message ? { tone: "bad", text: message } : null;
};

function ClaimCard({ t, notice }: { t: Translate; notice: string | null }) {
  return (
    <section className="card grid gap-4" aria-labelledby="claim-h" data-help="my-claim">
      <div className="grid gap-1">
        <h2 id="claim-h" className="text-[18px]">
          {t("player.claim.heading")}
        </h2>
        <p className="hint">{t("player.claim.body")}</p>
      </div>

      {notice && (
        <p className="notice bad" role="alert">
          {notice}
        </p>
      )}

      <form action={claimPlayerRecord} className="grid gap-3.5 sm:max-w-[26rem]">
        <label className="field">
          <span>{t("player.claim.ngapId")}</span>
          <input name="ngapId" type="text" inputMode="numeric" autoComplete="off" />
        </label>
        <label className="field">
          <span>{t("player.claim.birthdate")}</span>
          <input name="birthdate" type="date" autoComplete="bday" />
        </label>
        <p className="hint">{t("player.claim.help")}</p>
        <button type="submit" className="btn justify-self-start">
          {t("player.claim.submit")}
        </button>
      </form>
    </section>
  );
}

function PortalBody({
  t,
  state,
  notice,
  linkedMessage,
  today,
}: {
  t: Translate;
  state: PortalState;
  notice: string | null;
  linkedMessage: string | null;
  today: string;
}) {
  if (!state.linked || !state.player) {
    return (
      <div className="grid gap-4" data-help="my-entry">
        <PlayerOfflineNotice />
        <ClaimCard t={t} notice={notice} />
      </div>
    );
  }

  const next = nextUp(state.entries, today);

  return (
    <div className="grid gap-4" data-help="my-entry">
      <PlayerOfflineNotice />
      <RememberPortal state={state} />
      {next && <DashboardHero next={next} t={t} />}
      <AppTiles t={t} />
      <PortalEntries state={state} t={t} linkedMessage={linkedMessage} />
    </div>
  );
}

export default async function MyGolfPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string }>;
}) {
  const { t } = await getI18n();
  const params = await searchParams;
  const code = params.claim ?? "";
  const parsedNotice = code ? claimNotice(t, code) : null;
  const notice = parsedNotice?.tone === "bad" ? parsedNotice.text : null;
  const linkedMessage = parsedNotice?.tone === "ok" ? parsedNotice.text : null;

  if (!isSupabaseConfigured()) {
    return (
      <div className="grid gap-4" data-help="my-entry">
        <h1 className="font-serif text-[30px] leading-9 font-semibold">{t("player.title")}</h1>
        <p className="notice" role="status">
          {t("player.demo.body")} <Link href="/pairings">{t("player.demo.link")}</Link>.
        </p>
      </div>
    );
  }

  const client = await createSupabaseServerClient();
  const { data: user } = await client.auth.getUser();
  if (!user.user) {
    redirect("/login?next=%2Fmy&error=sign_in_required");
  }

  let state: PortalState;
  try {
    state = await loadPortal(client);
  } catch (error) {
    return (
      <div className="grid gap-4" data-help="my-entry">
        <h1 className="font-serif text-[30px] leading-9 font-semibold">{t("player.title")}</h1>
        <p className="notice bad" role="alert">
          {portalErrorMessage(error, t)}
        </p>
      </div>
    );
  }

  return (
    <PortalBody
      t={t}
      state={state}
      notice={notice}
      linkedMessage={linkedMessage}
      today={manilaToday()}
    />
  );
}
