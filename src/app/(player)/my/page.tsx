import Link from "next/link";
import { redirect } from "next/navigation";
import { fmtHcp, fmtIndex, fmtTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/t";
import { claimPlayerRecord } from "@/lib/player/actions";
import { claimMessage } from "@/lib/player/claim";
import {
  loadPortal,
  type PortalEntry,
  type PortalState,
  paymentLabel,
  portalErrorMessage,
  startLabel,
  statusLabel,
} from "@/lib/player/portal";
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

function EntryCard({ entry, t }: { entry: PortalEntry; t: Translate }) {
  const facts: { label: string; value: string }[] = [
    { label: t("player.fact.start"), value: startLabel(entry, t, fmtTime) },
    { label: t("player.fact.flight"), value: entry.flight ?? t("player.value.notPlacedYet") },
    { label: t("player.fact.tee"), value: entry.tee ?? t("player.value.notSetYet") },
    { label: t("player.fact.playingHandicap"), value: fmtHcp(entry.playingHandicap) },
    { label: t("player.fact.entryHandicap"), value: fmtIndex(entry.frozenIndex) },
    { label: t("player.fact.payment"), value: paymentLabel(t, entry.paymentStatus) },
  ];
  const unconfirmed = entry.status !== "ok";

  return (
    <article className="card grid gap-3" data-help="my-entry">
      <header className="grid gap-1">
        <h3 className="font-serif text-[24px] leading-7 font-semibold">{entry.eventName}</h3>
        <p className="hint">
          {entry.dates.length > 1
            ? entry.dates.join(" · ")
            : (entry.eventDate ?? t("player.value.dateTbc"))}
          {" · "}
          {entry.startFormat === "shotgun" ? t("player.value.shotgun") : t("player.value.twoTee")}
        </p>
      </header>

      {unconfirmed && (
        <p className={entry.status === "ineligible" ? "notice bad" : "notice warn"} role="status">
          <b>{statusLabel(t, entry.status)}.</b>
          {entry.reasons.length > 0 && <span> {entry.reasons.join(" ")}</span>}
        </p>
      )}

      <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line sm:grid-cols-3">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="grid content-start gap-0.5 bg-surface-raised px-3 py-2.5"
          >
            <dt className="small-h">{fact.label}</dt>
            <dd className="m-0 font-semibold tnum">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <p className="hint">
        {entry.published ? t("player.published.yes") : t("player.published.no")}{" "}
        <Link href="/pairings" data-help="my-pairings">
          {t("player.seeFullList")}
        </Link>
        .
      </p>
    </article>
  );
}

function ClaimCard({ t, notice }: { t: Translate; notice: string | null }) {
  return (
    <section className="card grid gap-4" aria-labelledby="claim-h">
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

      <form
        action={claimPlayerRecord}
        className="grid gap-3.5 sm:max-w-[26rem]"
        data-help="my-claim"
      >
        <label className="field">
          <span>{t("player.claim.name")}</span>
          <input name="name" type="text" autoComplete="name" />
        </label>
        <label className="field">
          <span>{t("player.claim.ngapId")}</span>
          <input name="ngapId" type="text" inputMode="numeric" />
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
}: {
  t: Translate;
  state: PortalState;
  notice: string | null;
  linkedMessage: string | null;
}) {
  if (!state.linked || !state.player) {
    return <ClaimCard t={t} notice={notice} />;
  }

  return (
    <div className="grid gap-4">
      {linkedMessage && (
        <p className="notice ok" role="status">
          {linkedMessage}
        </p>
      )}
      <div className="grid gap-1">
        <p className="overline">{t("player.title")}</p>
        <h1 className="font-serif text-[32px] leading-9 font-semibold">{state.player.name}</h1>
        {state.player.ngapId && <p className="hint">NGAP {state.player.ngapId}</p>}
      </div>

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
      <div className="grid gap-4">
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
      <div className="grid gap-4">
        <h1 className="font-serif text-[30px] leading-9 font-semibold">{t("player.title")}</h1>
        <p className="notice bad" role="alert">
          {portalErrorMessage(error, t)}
        </p>
      </div>
    );
  }

  return <PortalBody t={t} state={state} notice={notice} linkedMessage={linkedMessage} />;
}
