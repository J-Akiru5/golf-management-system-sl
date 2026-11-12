"use client";

import {
  ArrowLeft,
  Calculator,
  Camera,
  ClipboardList,
  History,
  ImageIcon,
  Link2,
  Lock,
  Pencil,
  ScrollText,
  Trophy,
  Users,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { Avatar } from "@/components/bits";
import {
  PairCard,
  PairDialog,
  type PairDialogTarget,
  RegistrationDaysEditor,
  RoleGate,
} from "@/components/desk";
import { NeedsTournament } from "@/components/NeedsTournament";
import { SectionCard } from "@/components/PageHeader";
import { PlayerCard } from "@/components/PlayerCard";
import { type PosterFactOption, PosterStudio } from "@/components/PosterStudio";
import { PlayerDetailsForm } from "@/components/player/PlayerDetailsForm";
import { Button } from "@/components/ui/button";
import { fmtIso } from "@/lib/data/labels";
import { registeredDayBadges } from "@/lib/data/sessions";
import { PAYMENT_LABEL } from "@/lib/data/types";
import { displayName, fmtHcp, fmtIndex, fmtTime, photoOf } from "@/lib/format";
import { formatName } from "@/lib/names";
import { nextPairNumber } from "@/lib/pairs/pairs";
import { shrinkPhoto } from "@/lib/photo";
import { rawCourseHandicap } from "@/lib/routing";
import { useDesk } from "@/lib/store/desk-store";

const SOURCE_LABEL = {
  ngap_import: "NGAP import",
  manual_fix: "Manually corrected",
  demo_seed: "Demo seed",
} as const;

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 justify-self-start">
      <Link href="/players">
        <ArrowLeft aria-hidden="true" />
        All players
      </Link>
    </Button>
  );
}

export default function PlayerProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const {
    tournament,
    playerById,
    players,
    entries,
    regById,
    entryByPlayer,
    draw,
    names,
    adapters,
    tees,
    days,
    member,
    status,
  } = useDesk();
  const player = playerById.get(id);
  const reg = regById.get(id);
  const entry = entryByPlayer.get(id);
  const [consent, setConsent] = useState(false);
  const [publicConsent, setPublicConsent] = useState(false);
  const [pending, setPending] = useState<string | undefined>();
  const [photoError, setPhotoError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMessage, setLinkMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pairTarget, setPairTarget] = useState<PairDialogTarget | null>(null);
  const canPair =
    status === "demo" ||
    member?.role === "owner" ||
    member?.role === "organizer" ||
    member?.role === "desk";

  if (!tournament) return <NeedsTournament what="The player profile" />;

  if (!player) {
    return (
      <div className="grid gap-6">
        <BackLink />
        <div className="card grid min-h-[260px] place-items-center text-center">
          <div className="grid justify-items-center gap-2">
            <UserX className="size-6 text-ink-muted" aria-hidden="true" />
            <h1 className="text-[22px] leading-7">Player not found</h1>
            <p className="muted">This player is not in the club directory.</p>
            <Button variant="secondary" asChild className="mt-2">
              <Link href="/players">Back to players</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const records = adapters.players
    .recordsFor(player.id)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  const latest = records[0] ?? null;
  const teeDef = reg?.teeId ? tees.find((t) => t.id === reg.teeId) : undefined;
  const raw =
    teeDef && reg && reg.frozenIndex !== null ? rawCourseHandicap(reg.frozenIndex, teeDef) : null;

  const shotgun = tournament.config.startFormat === "shotgun";
  const group = draw?.find((g) => g.playerIds.includes(player.id)) ?? null;
  const dayBadges = entry
    ? registeredDayBadges(
        entry,
        days.filter((day) => day.isPlayingDay),
      )
    : [];
  const photo = photoOf(player);
  const playerId = player.id;
  const dateLabel = new Date(`${tournament.config.date}T00:00:00`).toLocaleDateString("en-PH", {
    dateStyle: "long",
  });

  const options: PosterFactOption[] = [
    ...(reg && reg.frozenIndex !== null
      ? [{ id: "index", label: "Handicap Index", value: fmtIndex(reg.frozenIndex) }]
      : []),
    ...(reg && reg.playingHandicap !== null
      ? [{ id: "playing", label: "Course handicap", value: fmtHcp(reg.playingHandicap) }]
      : []),
    ...(reg?.categoryId
      ? [{ id: "category", label: "Category", value: names.category(reg.categoryId) }]
      : []),
    ...(reg?.flightId
      ? [{ id: "flight", label: "Flight", value: names.flight(reg.flightId) }]
      : []),
    ...(player.homeCourse ? [{ id: "home", label: "Home course", value: player.homeCourse }] : []),
  ];

  const facts: { label: string; value: string; mono?: boolean }[] = reg
    ? [
        {
          label: "Entry",
          value:
            reg.status === "ok"
              ? "Ready"
              : reg.status === "ineligible"
                ? "Not eligible"
                : "Needs review",
        },
        { label: "Role", value: reg.role === "guest" ? "Guest" : "Member" },
        {
          label: "Group",
          value: group
            ? `${shotgun ? "Hole" : "Tee"} ${group.startHole} · ${fmtTime(group.time)}`
            : draw
              ? "Not in a group"
              : "Draw not made yet",
        },
        { label: "NGAP ID", value: player.ngapId ?? "—", mono: true },
      ]
    : [
        { label: "Entry", value: "Not entered in this event" },
        { label: "NGAP ID", value: player.ngapId ?? "—", mono: true },
      ];

  /**
   * Links this record to an account that already exists. The database does the checks (role,
   * one-account-per-record, one-record-per-account); this only shows the answer.
   */
  async function linkAccount(e: React.FormEvent) {
    e.preventDefault();
    const email = linkEmail.trim();
    if (!email || linkBusy) return;
    setLinkBusy(true);
    setLinkMessage(null);
    try {
      await adapters.players.linkAccount(playerId, email);
      setLinkEmail("");
      setLinkMessage({
        tone: "ok",
        text: "The account is linked to this player. They can sign in to the player portal now.",
      });
    } catch (error) {
      setLinkMessage({
        tone: "bad",
        text:
          error instanceof Error
            ? error.message
            : "The account was not linked. Nothing was changed.",
      });
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <BackLink />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 gap-6">
          {reg ? (
            <PlayerCard
              player={player}
              reg={reg}
              names={names}
              profileLink={false}
              variant="hero"
            />
          ) : (
            <section className="card grid gap-4">
              <div className="flex items-center gap-3.5">
                <Avatar name={player.name} photo={photo} large />
                <div className="grid gap-1">
                  <p className="overline">Player profile</p>
                  <h1 className="text-[26px] leading-8">{player.name}</h1>
                  <span className="text-[13px] text-ink-muted">
                    Not entered in {tournament.name}
                    {player.homeCourse ? ` · ${player.homeCourse}` : ""}
                  </span>
                </div>
              </div>
              <Button variant="primary" asChild className="justify-self-start">
                <Link href={`/register?player=${player.id}`}>
                  <ClipboardList aria-hidden="true" />
                  Register in {tournament.name}
                </Link>
              </Button>
            </section>
          )}

          {entry && entry.teamNo != null && (
            <PairCard
              number={entry.teamNo}
              entries={entries}
              players={players}
              days={days}
              onManage={setPairTarget}
            />
          )}
          {entry && entry.teamNo == null && canPair && (
            <SectionCard
              id="pair-h"
              icon={<Users />}
              title="Pair"
              subtitle="This player is entered alone. A pair is one member and one guest."
            >
              <p className="muted text-[14px]">
                Pair this player with a member or guest who is already entered in the event. Both
                players keep their own days, status and handicap.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="justify-self-start"
                onClick={() =>
                  setPairTarget({
                    number: nextPairNumber(entries),
                    side: entry.role,
                    entryId: entry.id,
                    start: "menu",
                  })
                }
              >
                <Users aria-hidden="true" /> Pair this player
              </Button>
            </SectionCard>
          )}

          <SectionCard
            id="handicap-h"
            icon={<Calculator />}
            title="Handicap"
            subtitle="The index comes from the NGAP import. The playing handicap is worked out for the tee."
          >
            {reg && raw !== null && reg.frozenIndex !== null && teeDef ? (
              <p className="calc mono">
                {fmtIndex(reg.frozenIndex)} × ({teeDef.slope} ÷ 113) + ({teeDef.courseRating} −{" "}
                {teeDef.par}) = {raw.toFixed(1)}
                {tournament.config.allowance !== 1 &&
                  ` × ${Math.round(tournament.config.allowance * 100)}%`}{" "}
                → <b>{fmtHcp(reg.playingHandicap)}</b>
              </p>
            ) : (
              <p className="muted">
                {reg?.frozenIndex === null
                  ? "No frozen index for this event, so there is no playing handicap."
                  : "The registration is not in this event, so there is no playing handicap here."}
              </p>
            )}
            <p className="hint">
              {tournament.courseDataConfirmed
                ? "Tee ratings are the ones confirmed against the club scorecard."
                : "Tee ratings are not confirmed against the club scorecard yet, so treat playing handicaps as provisional."}{" "}
              The app never computes an official WHS index; it only reads what the import supplies.
            </p>
          </SectionCard>

          <SectionCard
            id="history-h"
            icon={<History />}
            title="Handicap history"
            subtitle={`Imported records for this player. The event freezes the latest one on or before ${tournament.cutOffDate}.`}
          >
            {records.length === 0 ? (
              <p className="muted text-[14px]">
                No handicap record on file. Nothing is estimated; the next NGAP import can supply
                one.
              </p>
            ) : (
              <ol className="plain grid gap-2">
                {records.map((r) => {
                  const frozenHere = reg?.frozenRecordId === r.id;
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border border-line px-3 py-2"
                    >
                      <span className="mono w-[4.5rem] font-semibold">
                        {fmtIso(r.effectiveDate)}
                      </span>
                      <span className="mono w-14 font-bold">{fmtIndex(r.index)}</span>
                      <span className="hint flex-1">{SOURCE_LABEL[r.source]}</span>
                      {frozenHere && <span className="pill gold">Frozen for this event</span>}
                      {r.id === latest?.id && !frozenHere && <span className="pill">Latest</span>}
                    </li>
                  );
                })}
              </ol>
            )}
            {reg?.frozenOutdated && (
              <div className="notice warn" role="status">
                <b>Re-freeze needed.</b> The records now select {fmtIndex(latest?.index ?? null)}
                {latest ? ` (${latest.effectiveDate})` : ""}, but this registration still uses{" "}
                {fmtIndex(reg.frozenIndex)}. Re-freeze from the registration desk.
              </div>
            )}
          </SectionCard>

          <SectionCard id="event-h" icon={<Trophy />} title="Registration">
            <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line sm:grid-cols-4">
              {facts.map((f) => (
                <div
                  key={f.label}
                  className="grid content-start gap-0.5 bg-surface-raised px-3 py-2.5"
                >
                  <dt className="text-[10.5px] leading-4 font-semibold tracking-[.08em] text-ink-muted uppercase">
                    {f.label}
                  </dt>
                  <dd className={f.mono ? "m-0 font-semibold tnum" : "m-0 font-semibold"}>
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
            {entry && (
              <div className="grid gap-2 text-[14px]">
                <p>
                  <b>{tournament.registration.sponsorQuestion}</b>{" "}
                  {entry.sponsor === null ? "Not asked yet." : entry.sponsor ? "Yes." : "No."}
                </p>
                <p>
                  <b>Playing days.</b>{" "}
                  {dayBadges.length > 0 ? (
                    <span className="inline-flex flex-wrap gap-1 align-middle">
                      {dayBadges.map((day) => (
                        <span key={day.dayNumber} className="pill">
                          {day.dayLabel} · {day.label} {day.time}
                        </span>
                      ))}
                    </span>
                  ) : (
                    "No playing days selected."
                  )}
                </p>
                <p>
                  <b>Tee-time preferences.</b>{" "}
                  {tournament.registration.teeTimes
                    .map(
                      (d) =>
                        `${d.label}: ${entry.teePreferences[d.date] ?? "not given"}${
                          d.needsConfirmation ? " (needs organizer confirmation)" : ""
                        }`,
                    )
                    .join(" · ")}
                </p>
                <p>
                  <b>Shirt size.</b> {entry.shirt ?? "Not given"} · <b>Payment.</b>{" "}
                  {PAYMENT_LABEL[entry.paymentStatus]} (recorded by hand, no online payment)
                </p>
                {entry.declaredWshId && (
                  <p className="hint">
                    WHS ID given on the form: {entry.declaredWshId}
                    {entry.declaredWshHandicap
                      ? ` · WHS handicap as of 1 Oct 2026: ${entry.declaredWshHandicap}`
                      : ""}
                    . Informational only; eligibility uses the imported index.
                  </p>
                )}
              </div>
            )}
            {entry && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <RegistrationDaysEditor
                  entry={entry}
                  days={days.filter((day) => day.isPlayingDay)}
                  required={tournament.requiredDays ?? null}
                  max={tournament.maxDays ?? null}
                  onSave={(next, sessions) =>
                    adapters.registrations.setDays(entry.id, next, sessions)
                  }
                />
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/register">Open registration desk</Link>
                </Button>
              </div>
            )}
          </SectionCard>

          <div className="grid gap-6 md:grid-cols-2">
            <SectionCard id="scoring-h" icon={<ScrollText />} title="Scoring record">
              <p className="muted text-[14px]">
                No scores are recorded for this player. Scoring is not part of this version, so
                scoring averages, rounds played and past results are left out rather than estimated.
                They will appear here once scorecards are entered.
              </p>
            </SectionCard>
            <SectionCard id="past-h" icon={<History />} title="Past tournaments">
              <p className="muted text-[14px]">
                No earlier tournaments are recorded for this player here.
              </p>
            </SectionCard>
          </div>
        </div>

        <div className="grid gap-6">
          <SectionCard
            id="photo-h"
            icon={<Camera />}
            title="Photo"
            subtitle="Kept only with the player's agreement. Public display needs a separate opt-in."
          >
            {photo ? (
              <img
                className="aspect-square w-full max-w-[240px] rounded-[14px] border border-line object-cover"
                src={photo}
                alt={`${player.name}`}
              />
            ) : (
              <div className="grid h-36 w-full place-items-center rounded-[14px] border border-dashed border-line-strong bg-surface-sunken text-center">
                <div className="grid justify-items-center gap-1.5 px-4">
                  <ImageIcon className="size-6 text-ink-muted" aria-hidden="true" />
                  <p className="muted text-[14px]">No photo on file with the player's agreement.</p>
                </div>
              </div>
            )}
            <label className="field">
              <span>{photo ? "Replace photo" : "Add photo"}</span>
              <input
                type="file"
                accept="image/*"
                capture="user"
                className="text-[13px] text-ink-muted"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  setPhotoError("");
                  setConsent(false);
                  setPublicConsent(false);
                  if (!f) return setPending(undefined);
                  try {
                    setPending(await shrinkPhoto(f));
                  } catch (err) {
                    setPhotoError((err as Error).message);
                  }
                }}
              />
            </label>
            {photoError && (
              <p className="hint !text-danger" role="alert">
                {photoError}
              </p>
            )}
            {pending && (
              <div className="grid gap-3 rounded-[12px] bg-surface-sunken p-3">
                <label className="check text-[13px]">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => {
                      setConsent(e.target.checked);
                      if (!e.target.checked) setPublicConsent(false);
                    }}
                  />
                  <span>
                    The player agrees to have their photo kept on file and used for check-in, their
                    player profile and tournament posters.
                  </span>
                </label>
                <label className="check text-[13px]">
                  <input
                    type="checkbox"
                    checked={publicConsent}
                    disabled={!consent}
                    onChange={(e) => setPublicConsent(e.target.checked)}
                  />
                  <span>
                    Separately, the player agrees this photo may appear on public pairings, the
                    public leaderboard and printed start sheets. This is optional.
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!consent || photoBusy}
                    onClick={async () => {
                      setPhotoError("");
                      setPhotoBusy(true);
                      try {
                        await adapters.players.setPhoto(player.id, pending, {
                          internal: consent,
                          public: publicConsent,
                        });
                        setPending(undefined);
                        setConsent(false);
                        setPublicConsent(false);
                      } catch (err) {
                        setPhotoError(
                          err instanceof Error ? err.message : "Could not save the photo.",
                        );
                      } finally {
                        setPhotoBusy(false);
                      }
                    }}
                  >
                    {photoBusy ? "Saving…" : "Save photo"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPending(undefined)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {photo && !pending && (
              <div className="grid gap-3">
                <label className="check text-[13px]">
                  <input
                    type="checkbox"
                    checked={Boolean(player.photoPublicConsent)}
                    disabled={photoBusy}
                    onChange={async (e) => {
                      setPhotoError("");
                      setPhotoBusy(true);
                      try {
                        await adapters.players.setPhotoPublicConsent(player.id, e.target.checked);
                      } catch (err) {
                        setPhotoError(
                          err instanceof Error
                            ? err.message
                            : "Could not change the public photo consent.",
                        );
                      } finally {
                        setPhotoBusy(false);
                      }
                    }}
                  />
                  <span>
                    Allow this photo on public pairings, the public leaderboard and printed start
                    sheets. Internal consent alone does not do this.
                  </span>
                </label>
                <Button
                  variant="secondary"
                  size="sm"
                  className="justify-self-start"
                  disabled={photoBusy}
                  onClick={async () => {
                    setPhotoError("");
                    setPhotoBusy(true);
                    try {
                      await adapters.players.removePhoto(player.id);
                    } catch (err) {
                      setPhotoError(
                        err instanceof Error ? err.message : "Could not remove the photo.",
                      );
                    } finally {
                      setPhotoBusy(false);
                    }
                  }}
                >
                  Remove photo
                </Button>
              </div>
            )}
          </SectionCard>

          <SectionCard
            id="private-h"
            icon={<Lock />}
            title="Private details"
            subtitle="Organizer screens only. Never on public pairings or posters."
          >
            <dl className="grid gap-1.5 text-[14px]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Birthdate</dt>
                <dd className="m-0 font-semibold tnum">
                  {player.birthdate ? fmtIso(player.birthdate) : "Not on file"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Contact</dt>
                <dd className="m-0 font-semibold">{player.contactNumber ?? "Not on file"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Email</dt>
                <dd className="m-0 min-w-0 truncate font-semibold">
                  {player.email ?? "Not on file"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Photo consent</dt>
                <dd className="m-0 font-semibold">
                  {player.photoConsent ? "Internal use recorded" : "Not recorded"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Public photo consent</dt>
                <dd className="m-0 font-semibold">
                  {player.photoPublicConsent ? "Public display allowed" : "Not allowed"}
                </dd>
              </div>
            </dl>
            <p className="hint">
              Birthdates, contact details and private photo paths are personal data under the Data
              Privacy Act of 2012. Public pages only receive a photo path from the public bucket
              when the separate public consent is recorded. Withdrawal removes the public copy.
            </p>
          </SectionCard>

          {status !== "demo" && member !== undefined && (
            <RoleGate role={member?.role} allow={["owner", "organizer", "desk"]} mode="hide">
              <SectionCard
                id="account-h"
                icon={<Link2 />}
                title="Player portal account"
                subtitle="Links this directory record to the sign-in account the player already has."
              >
                <form className="grid gap-3" onSubmit={(e) => void linkAccount(e)}>
                  <label className="field">
                    <span>Account email</span>
                    <input
                      type="email"
                      value={linkEmail}
                      disabled={linkBusy}
                      onChange={(e) => {
                        setLinkEmail(e.target.value);
                        setLinkMessage(null);
                      }}
                      placeholder="The address they sign in with"
                      autoComplete="off"
                    />
                  </label>
                  <p className="hint">
                    The account must already exist. The database refuses when this record or the
                    account is already linked, and it never shows the account id.
                  </p>
                  {linkMessage && (
                    <p
                      className={
                        linkMessage.tone === "bad" ? "hint !text-danger" : "hint !text-fairway"
                      }
                      role={linkMessage.tone === "bad" ? "alert" : "status"}
                    >
                      {linkMessage.text}
                    </p>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    className="justify-self-start"
                    disabled={linkBusy || !linkEmail.trim()}
                  >
                    <Link2 aria-hidden="true" />{" "}
                    {linkBusy
                      ? "Linking…"
                      : linkMessage?.tone === "bad"
                        ? "Try link again"
                        : "Link account"}
                  </Button>
                </form>
              </SectionCard>
            </RoleGate>
          )}
        </div>
      </div>

      <RoleGate role={member?.role} allow={["owner", "organizer"]} mode="hide">
        <SectionCard
          id="details-h"
          icon={<Pencil />}
          title="Player details"
          subtitle="Corrections are saved to the club directory and recorded in the audit log."
        >
          <PlayerDetailsForm
            player={player}
            canEdit={!member || member.role === "owner" || member.role === "organizer"}
            onSave={(patch) => {
              const fullName = formatName(patch.firstName, patch.lastName);
              adapters.players.update(player.id, {
                ...patch,
                name: displayName(fullName),
                fullName,
              });
            }}
            onSaveMembership={(type, memberNumber) =>
              adapters.players.setMembership(player.id, type, memberNumber)
            }
          />
        </SectionCard>
      </RoleGate>

      <section aria-labelledby="poster-h" className="grid gap-4">
        <div className="wave-head">
          <h2 id="poster-h">Poster</h2>
          <span className="muted">
            League-style player card, built from this player's record. Nothing is made up.
          </span>
        </div>
        <PosterStudio
          key={player.id}
          playerName={player.name}
          photo={photo}
          club="TeeLine Golf · IGCC"
          event={tournament.name.replace(/\s*\(demo sample title\)\s*$/i, "")}
          dateLabel={dateLabel}
          options={options}
        />
      </section>

      {pairTarget && (
        <PairDialog
          open={pairTarget !== null}
          onOpenChange={(open) => {
            if (!open) setPairTarget(null);
          }}
          target={pairTarget}
          tournamentId={tournament.id}
          entries={entries}
          players={players}
          onSave={(input) => adapters.pairs.save(input)}
          onSwap={(input) => adapters.pairs.swap(input)}
        />
      )}
    </div>
  );
}
