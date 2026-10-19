import Link from "next/link";
import { fmtHcp, fmtIndex, fmtTime } from "@/lib/format";
import {
  type PortalEntry,
  type PortalState,
  paymentLabel,
  startLabel,
  statusLabel,
} from "@/lib/player/portal";

/**
 * The read-only player view. Server and client both render it: /my passes the live portal read,
 * and the offline page passes the last saved snapshot. Keeping one view means the offline copy
 * cannot accidentally show a field the live screen hides.
 */
export function EntryCard({ entry }: { entry: PortalEntry }) {
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

/** The signed-in player's name and every event they are entered in. */
export function PortalEntries({
  state,
  linkedMessage,
  nameHeading = "h1",
}: {
  state: PortalState;
  linkedMessage?: string | null;
  /** The offline page already has its own h1, so it asks for h2. */
  nameHeading?: "h1" | "h2";
}) {
  const NameHeading = nameHeading;
  return (
    <div className="grid gap-4">
      {linkedMessage && (
        <p className="notice ok" role="status">
          {linkedMessage}
        </p>
      )}
      {state.player && (
        <div className="grid gap-1">
          <p className="overline">My golf</p>
          <NameHeading className="font-serif text-[32px] leading-9 font-semibold">
            {state.player.name}
          </NameHeading>
          {state.player.ngapId && <p className="hint">NGAP {state.player.ngapId}</p>}
        </div>
      )}

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
