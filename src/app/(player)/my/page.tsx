import Link from "next/link";
import { redirect } from "next/navigation";
import { AppTiles } from "@/components/player/DashboardHero";
import { PlayerHomeDesktop } from "@/components/player/desktop/PlayerHomeDesktop";
import { PlayerOfflineNotice, RememberPortal } from "@/components/player/OfflinePortal";
import { PlayerHomeHero } from "@/components/player/PlayerHomeHero";
import { PortalEntries } from "@/components/player/PortalView";
import { loadPublicPairings } from "@/lib/data/supabase/public-pairings";
import { getI18n } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/t";
import { claimPlayerRecord } from "@/lib/player/actions";
import { claimMessage } from "@/lib/player/claim";
import { manilaToday, nextUp } from "@/lib/player/dashboard";
import { demoGroupMates, demoPortalState } from "@/lib/player/demo";
import { groupMates } from "@/lib/player/group";
import {
  loadPortal,
  type PortalEntry,
  type PortalState,
  portalErrorMessage,
} from "@/lib/player/portal";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
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

/**
 * The group around the player, for the hero card. It is an optional read from the same public
 * pairings the player can already open, so a failure here costs the names and nothing else.
 */
async function loadGroupMates(entry: PortalEntry, name: string): Promise<string[]> {
  if (!entry.start) return [];
  try {
    const data = await loadPublicPairings(createSupabasePublicClient());
    if (!data?.published) return [];
    return groupMates(data.published.groups, {
      name,
      time: entry.start.time,
      hole: entry.start.hole,
    });
  } catch {
    return [];
  }
}

/**
 * Linking a record, without making the NGAP number look like the only door.
 *
 * The account's own verified email is tried first with one tap. The NGAP and birthdate route stays
 * available underneath, in a disclosure the player opens only if they need it. Nothing here gates
 * the rest of the player app: pairings, the board and the course stay open.
 */
function ClaimCard({
  t,
  notice,
  defaultNgap,
}: {
  t: Translate;
  notice: string | null;
  /** Carried by a scorecard's QR code, so the form opens with the number already in it. */
  defaultNgap: string;
}) {
  return (
    <section className="card grid gap-4" aria-labelledby="claim-h" data-help="my-claim">
      <div className="grid gap-1">
        <h2 id="claim-h" className="text-[19px]">
          {t("player.claim.heading")}
        </h2>
        <p className="hint">{t("player.claim.notLinked")}</p>
      </div>

      {notice && (
        <p className="notice bad" role="alert">
          {notice}
        </p>
      )}

      {/* The account's own verified email is the first proof: no NGAP number needed when the club
          already holds that address on the record. The database does the match and refuses a shared
          address rather than guessing. */}
      <form action={claimPlayerRecord} className="grid gap-2">
        <button type="submit" className="btn min-h-12 w-full">
          {t("player.claim.emailSubmit")}
        </button>
        <p className="hint">{t("player.claim.emailBody")}</p>
      </form>

      <details className="claim-more border-t border-line pt-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-semibold">
          {t("player.claim.orNgap")}
        </summary>
        <form action={claimPlayerRecord} className="mt-3 grid gap-3">
          <label className="field">
            <span>{t("player.claim.ngapId")}</span>
            <input
              name="ngapId"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="text-[16px]"
              defaultValue={defaultNgap}
            />
          </label>
          <label className="field">
            <span>{t("player.claim.birthdate")}</span>
            <input name="birthdate" type="date" autoComplete="bday" className="text-[16px]" />
          </label>
          <p className="hint">{t("player.claim.help")}</p>
          <button type="submit" className="btn ghost min-h-12 w-full justify-center">
            {t("player.claim.submit")}
          </button>
        </form>
      </details>
    </section>
  );
}

/** The demo build has no accounts, so the home page shows a labelled sample instead of a notice. */
function DemoHome({ t }: { t: Translate }) {
  const today = manilaToday();
  const state = demoPortalState();
  const entry = state.entries[0];

  return (
    <div className="player-page grid gap-4">
      <header className="grid gap-1">
        <p className="overline">{t("player.title")}</p>
        <h1 className="font-serif text-[28px] leading-8 font-semibold">{state.player?.name}</h1>
      </header>

      {entry && <PlayerHomeHero entry={entry} today={today} groupMates={demoGroupMates()} demo />}

      <AppTiles t={t} />

      {entry && (
        <PortalEntries
          state={state}
          t={t}
          nameHeading="h2"
          showName={false}
          showScorecards={false}
        />
      )}

      <p className="notice" role="status">
        {t("player.demo.body")}{" "}
        <Link href="/pairings" className="font-semibold underline underline-offset-2">
          {t("player.demo.link")}
        </Link>
        .
      </p>
    </div>
  );
}

function HomeBody({
  t,
  state,
  today,
  mates,
}: {
  t: Translate;
  state: PortalState;
  today: string;
  mates: string[];
}) {
  const next = nextUp(state.entries, today);

  return (
    <div className="player-page grid gap-4" data-help="my-entry">
      <PlayerOfflineNotice />
      <RememberPortal state={state} />

      <header className="grid gap-1">
        <p className="overline">{t("player.title")}</p>
        <h1 className="font-serif text-[28px] leading-8 font-semibold">{state.player?.name}</h1>
        {state.player?.ngapId && (
          <p className="hint">
            {t("player.profile.ngap")} {state.player.ngapId}
          </p>
        )}
      </header>

      {next ? (
        <PlayerHomeHero entry={next.entry} today={today} groupMates={mates} />
      ) : (
        <section className="card grid gap-2" role="status">
          <h2 className="text-[19px]">{t("player.home.notOutTitle")}</h2>
          <p className="hint">{t("player.noEntries")}</p>
          <Link href="/pairings" className="btn gold justify-self-start no-underline">
            {t("player.home.notOutAction")}
          </Link>
        </section>
      )}

      <AppTiles t={t} />

      <section className="grid gap-3" aria-labelledby="entries-h">
        <h2 id="entries-h" className="text-[20px] leading-7">
          {t("player.profile.entries")}
        </h2>
        <PortalEntries
          state={state}
          t={t}
          nameHeading="h2"
          showName={false}
          showScorecards={false}
        />
        <p className="hint">
          <Link href="/my/card">{t("player.app.openCard")}</Link>
          {" · "}
          <Link href="/my/board">{t("player.app.openBoard")}</Link>
        </p>
      </section>
    </div>
  );
}

export default async function MyGolfPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string; ngap?: string; demo?: string }>;
}) {
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const code = params.claim ?? "";
  // A printed card's QR code carries the NGAP number, so the claim form opens with it filled in.
  const defaultNgap = (params.ngap ?? "").replace(/[^0-9A-Za-z-]/g, "").slice(0, 40);
  const parsedNotice = code ? claimNotice(t, code) : null;
  const notice = parsedNotice?.tone === "bad" ? parsedNotice.text : null;
  const linkedMessage = parsedNotice?.tone === "ok" ? parsedNotice.text : null;

  if (!isSupabaseConfigured()) {
    // S5 demo hook. `?demo=desktop` shows the wide home with sample data, and `?demo=unlinked`
    // shows the same screen before the club has linked a record. Demo builds only: with Supabase
    // configured the normal signed-in path runs and this block is never reached.
    if (params.demo === "desktop" || params.demo === "unlinked") {
      const { demoPortalState, demoUnlinkedState } = await import(
        "@/components/player/desktop/demo-data"
      );
      return (
        <PlayerHomeDesktop
          t={t}
          state={params.demo === "unlinked" ? demoUnlinkedState : demoPortalState}
          notice={null}
          linkedMessage={null}
          today={manilaToday()}
          defaultNgap={defaultNgap}
          locale={locale}
          demo
        />
      );
    }

    return <DemoHome t={t} />;
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
      <div className="player-page grid gap-4" data-help="my-entry">
        <h1 className="font-serif text-[28px] leading-8 font-semibold">{t("player.title")}</h1>
        <p className="notice bad" role="alert">
          {portalErrorMessage(error, t)}
        </p>
        <Link href="/my" className="btn ghost justify-self-start no-underline">
          {t("pairings.retry")}
        </Link>
      </div>
    );
  }

  if (!state.linked || !state.player) {
    // Not linked is not a locked door. The player pages stay open and say what is missing; only
    // the entries wait for the club to link the record.
    return (
      <>
        <div className="hidden lg:block">
          <PlayerHomeDesktop
            t={t}
            state={state}
            notice={notice}
            linkedMessage={linkedMessage}
            today={manilaToday()}
            defaultNgap={defaultNgap}
            locale={locale}
          />
        </div>
        <div className="player-page grid gap-4 lg:hidden" data-help="my-entry">
          <PlayerOfflineNotice />
          <header className="grid gap-1">
            <p className="overline">{t("player.title")}</p>
            <h1 className="font-serif text-[28px] leading-8 font-semibold">
              {state.player?.name ?? t("player.title")}
            </h1>
          </header>
          <PortalEntries state={state} t={t} linkedMessage={linkedMessage} showName={false} />
          <AppTiles t={t} />
          <ClaimCard t={t} notice={notice} defaultNgap={defaultNgap} />
        </div>
      </>
    );
  }

  const next = nextUp(state.entries, manilaToday());
  const mates = next ? await loadGroupMates(next.entry, state.player.name) : [];

  return (
    <>
      {/* Wide screens get the two-column home; a phone keeps the single-column home. */}
      <div className="hidden lg:block">
        <PlayerHomeDesktop
          t={t}
          state={state}
          notice={notice}
          linkedMessage={linkedMessage}
          today={manilaToday()}
          defaultNgap={defaultNgap}
          locale={locale}
        />
      </div>
      <div className="lg:hidden">
        <div className="grid gap-4">
          {linkedMessage && (
            <p className="notice ok" role="status">
              {linkedMessage}
            </p>
          )}
          <HomeBody t={t} state={state} today={manilaToday()} mates={mates} />
        </div>
      </div>
    </>
  );
}
