"use client";

import {
  ArrowLeft,
  Calculator,
  Camera,
  History,
  ImageIcon,
  ScrollText,
  Trophy,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { SectionCard } from "@/components/PageHeader";
import { PlayerCard } from "@/components/PlayerCard";
import { type PosterFactOption, PosterStudio } from "@/components/PosterStudio";
import { Button } from "@/components/ui/button";
import { DEMO_TEES } from "@/lib/demo/data";
import { fmtHcp, fmtIndex, fmtTime, photoOf } from "@/lib/format";
import { shrinkPhoto } from "@/lib/photo";
import { rawCourseHandicap } from "@/lib/routing";
import { useDesk } from "@/lib/store/desk-store";

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
  const { state, playerById, regById, names, dispatch } = useDesk();
  const player = playerById.get(id);
  const reg = regById.get(id);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState<string | undefined>();
  const [photoError, setPhotoError] = useState("");

  if (!player || !reg) {
    return (
      <div className="grid gap-6">
        <BackLink />
        <div className="card grid min-h-[260px] place-items-center text-center">
          <div className="grid justify-items-center gap-2">
            <UserX className="size-6 text-ink-muted" aria-hidden="true" />
            <h1 className="text-[22px] leading-7">Player not found</h1>
            <p className="muted">This player is not in the tournament any more.</p>
            <Button variant="secondary" asChild className="mt-2">
              <Link href="/players">Back to players</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const tee = DEMO_TEES.find((t) => t.id === reg.teeId);
  const group = state.draw?.find((g) => g.playerIds.includes(player.id));
  const shotgun = state.config.startFormat === "shotgun";
  const photo = photoOf(player);
  const dateLabel = new Date(`${state.config.date}T00:00:00`).toLocaleDateString("en-PH", {
    dateStyle: "long",
  });

  const options: PosterFactOption[] = [
    ...(player.index !== null
      ? [{ id: "index", label: "Handicap Index", value: fmtIndex(player.index) }]
      : []),
    ...(reg.playingHandicap !== null
      ? [{ id: "playing", label: "Playing handicap", value: fmtHcp(reg.playingHandicap) }]
      : []),
    ...(reg.categoryId
      ? [{ id: "category", label: "Category", value: names.category(reg.categoryId) }]
      : []),
    ...(reg.flightId ? [{ id: "flight", label: "Flight", value: names.flight(reg.flightId) }] : []),
  ];

  const raw = tee && player.index !== null ? rawCourseHandicap(player.index, tee) : null;

  const facts: { label: string; value: string; mono?: boolean }[] = [
    {
      label: "Entry",
      value:
        reg.status === "ok"
          ? "Ready"
          : reg.status === "ineligible"
            ? "Not eligible"
            : "Needs review",
    },
    {
      label: "Group",
      value: group
        ? `${shotgun ? "Hole" : "Tee"} ${group.startHole} · ${fmtTime(group.time)}`
        : state.draw
          ? "Not in a group"
          : "Draw not made yet",
    },
    { label: "NGAP ID", value: player.ngapId ?? "—", mono: true },
    { label: "T-shirt", value: player.shirt ?? "—" },
  ];

  return (
    <div className="grid gap-6">
      <BackLink />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 gap-6">
          <PlayerCard player={player} reg={reg} names={names} profileLink={false} variant="hero" />

          <SectionCard
            id="handicap-h"
            icon={<Calculator />}
            title="Handicap"
            subtitle="Index from NGAP, playing handicap for the tee they play."
          >
            <p>
              The <b>Handicap Index</b> comes from NGAP and travels with the player. The{" "}
              <b>playing handicap</b> is worked out for the tee they play, and is what counts on the
              day.
            </p>
            {raw !== null && tee && player.index !== null ? (
              <p className="calc mono">
                {fmtIndex(player.index)} × ({tee.slope} ÷ 113) + ({tee.courseRating} − {tee.par}) ={" "}
                {raw.toFixed(1)}
                {state.config.allowance !== 1 && ` × ${Math.round(state.config.allowance * 100)}%`}{" "}
                → <b>{fmtHcp(reg.playingHandicap)}</b>
              </p>
            ) : (
              <p className="muted">
                {player.index === null
                  ? "No Handicap Index on file, so there is no playing handicap."
                  : "No tee yet, so there is no playing handicap."}
              </p>
            )}
            {tee && (
              <p className="hint">
                Uses the {tee.name} tee ratings entered in this demo. They are placeholders until
                the club’s real Course Rating, Slope and Par are entered.
              </p>
            )}
          </SectionCard>

          <SectionCard id="event-h" icon={<Trophy />} title="This tournament">
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

        <SectionCard
          id="photo-h"
          icon={<Camera />}
          title="Photo"
          subtitle="Kept only with the player’s agreement. Never shown on public pages."
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
                <p className="muted text-[14px]">No photo on file with the player’s agreement.</p>
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
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  The player agrees to have their photo kept on file and used for check-in, their
                  player profile and tournament posters.
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!consent}
                  onClick={() => {
                    dispatch({
                      type: "updatePlayer",
                      id: player.id,
                      patch: { photo: pending, photoConsent: true },
                    });
                    setPending(undefined);
                    setConsent(false);
                  }}
                >
                  Save photo
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPending(undefined)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {photo && !pending && (
            <Button
              variant="secondary"
              size="sm"
              className="justify-self-start"
              onClick={() =>
                dispatch({
                  type: "updatePlayer",
                  id: player.id,
                  patch: { photo: undefined, photoConsent: undefined },
                })
              }
            >
              Remove photo
            </Button>
          )}
        </SectionCard>
      </div>

      <section aria-labelledby="poster-h" className="grid gap-4">
        <div className="wave-head">
          <h2 id="poster-h">Poster</h2>
          <span className="muted">Built from this player’s record. Nothing is made up.</span>
        </div>
        <PosterStudio
          key={player.id}
          playerName={player.name}
          photo={photo}
          club="Iloilo Golf & Country Club"
          event={state.name.replace(/\s*\(demo\)\s*$/i, "")}
          dateLabel={dateLabel}
          options={options}
        />
      </section>
    </div>
  );
}
