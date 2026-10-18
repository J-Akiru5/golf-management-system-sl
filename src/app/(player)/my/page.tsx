import Link from "next/link";
import { redirect } from "next/navigation";
import { fmtHcp, fmtIndex, fmtTime } from "@/lib/format";
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

export const metadata = { title: "My golf" };

const claimNotice = (code: string): { tone: "ok" | "bad"; text: string } | null => {
  if (code === "linked")
    return { tone: "ok", text: "Your member record is now linked to this account." };
  if (code === "start") return null;
  if (code === "not_ready") {
    return {
      tone: "bad",
      text: "The player area is not switched on for this project yet. The club has to apply the player portal migration first.",
    };
  }
  if (code === "failed") {
    return {
      tone: "bad",
      text: "Your record could not be linked just now. Try again in a moment.",
    };
  }
  const message = claimMessage(code);
  return message ? { tone: "bad", text: message } : null;
};

function EntryCard({ entry }: { entry: PortalEntry }) {
  const facts: { label: string; value: string }[] = [
    { label: "Start", value: startLabel(entry, fmtTime) },
    { label: "Flight", value: entry.flight ?? "Not placed yet" },
    { label: "Tee", value: entry.tee ?? "Not set yet" },
    { label: "Playing handicap", value: fmtHcp(entry.playingHandicap) },
    { label: "Entry handicap", value: fmtIndex(entry.frozenIndex) },
    { label: "Payment", value: paymentLabel(entry.paymentStatus) },
  ];
  const unconfirmed = entry.status !== "ok";

  return (
    <article className="card grid gap-3">
      <header className="grid gap-1">
        <h3 className="font-serif text-[24px] leading-7 font-semibold">{entry.eventName}</h3>
        <p className="hint">
          {entry.dates.length > 1
            ? entry.dates.join(" · ")
            : (entry.eventDate ?? "Date to be confirmed")}
          {" · "}
          {entry.startFormat === "shotgun" ? "Shotgun start" : "Two-tee start"}
        </p>
      </header>

      {unconfirmed && (
        <p className={entry.status === "ineligible" ? "notice bad" : "notice warn"} role="status">
          <b>{statusLabel(entry.status)}.</b>
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
        {entry.published
          ? "These are the published pairings. "
          : "The club has not published the pairings yet. "}
        <Link href="/pairings">See the full list</Link>.
      </p>
    </article>
  );
}

function ClaimCard({ notice }: { notice: string | null }) {
  return (
    <section className="card grid gap-4" aria-labelledby="claim-h">
      <div className="grid gap-1">
        <h2 id="claim-h" className="text-[18px]">
          Link your club record
        </h2>
        <p className="hint">
          This account is not linked to a member record yet, so there is nothing to show. Link it
          once: the club matches what you enter against the member list, exactly as the entry form
          does.
        </p>
      </div>

      {notice && (
        <p className="notice bad" role="alert">
          {notice}
        </p>
      )}

      <form action={claimPlayerRecord} className="grid gap-3.5 sm:max-w-[26rem]">
        <label className="field">
          <span>Full name, as the club has it</span>
          <input name="name" type="text" autoComplete="name" />
        </label>
        <label className="field">
          <span>NGAP number (if you know it)</span>
          <input name="ngapId" type="text" inputMode="numeric" />
        </label>
        <p className="hint">
          A name that matches more than one member is refused rather than guessed, so the NGAP
          number settles it.
        </p>
        <button type="submit" className="btn justify-self-start">
          Link my record
        </button>
      </form>
    </section>
  );
}

function PortalBody({
  state,
  notice,
  linkedMessage,
}: {
  state: PortalState;
  notice: string | null;
  linkedMessage: string | null;
}) {
  if (!state.linked || !state.player) {
    return <ClaimCard notice={notice} />;
  }

  return (
    <div className="grid gap-4">
      {linkedMessage && (
        <p className="notice ok" role="status">
          {linkedMessage}
        </p>
      )}
      <div className="grid gap-1">
        <p className="overline">My golf</p>
        <h1 className="font-serif text-[32px] leading-9 font-semibold">{state.player.name}</h1>
        {state.player.ngapId && <p className="hint">NGAP {state.player.ngapId}</p>}
      </div>

      {state.entries.length === 0 ? (
        <p className="notice" role="status">
          No entries on file for you yet. Enter through the event link the club sent you, or ask the
          club to add you to the event.
        </p>
      ) : (
        <div className="grid gap-4">
          {state.entries.map((entry) => (
            <EntryCard key={entry.tournamentId} entry={entry} />
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
  const params = await searchParams;
  const code = params.claim ?? "";
  const parsedNotice = code ? claimNotice(code) : null;
  const notice = parsedNotice?.tone === "bad" ? parsedNotice.text : null;
  const linkedMessage = parsedNotice?.tone === "ok" ? parsedNotice.text : null;

  if (!isSupabaseConfigured()) {
    return (
      <div className="grid gap-4">
        <h1 className="font-serif text-[30px] leading-9 font-semibold">My golf</h1>
        <p className="notice" role="status">
          This build runs on demo data with no accounts, so there is no player area here.{" "}
          <Link href="/pairings">The published pairings are this way</Link>.
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
        <h1 className="font-serif text-[30px] leading-9 font-semibold">My golf</h1>
        <p className="notice bad" role="alert">
          {portalErrorMessage(error)}
        </p>
      </div>
    );
  }

  return <PortalBody state={state} notice={notice} linkedMessage={linkedMessage} />;
}
