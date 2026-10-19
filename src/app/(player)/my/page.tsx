import Link from "next/link";
import { redirect } from "next/navigation";
import { PlayerOfflineNotice, RememberPortal } from "@/components/player/OfflinePortal";
import { PortalEntries } from "@/components/player/PortalView";
import { claimPlayerRecord } from "@/lib/player/actions";
import { claimMessage } from "@/lib/player/claim";
import { loadPortal, type PortalState, portalErrorMessage } from "@/lib/player/portal";
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
    return (
      <div className="grid gap-4">
        <PlayerOfflineNotice />
        <ClaimCard notice={notice} />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <PlayerOfflineNotice />
      <RememberPortal state={state} />
      <PortalEntries state={state} linkedMessage={linkedMessage} />
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
