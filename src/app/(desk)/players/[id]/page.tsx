"use client";

import Link from "next/link";
import { use, useState } from "react";
import { PlayerCard } from "@/components/PlayerCard";
import { type PosterFactOption, PosterStudio } from "@/components/PosterStudio";
import { DEMO_TEES } from "@/lib/demo/data";
import { fmtHcp, fmtIndex, fmtTime, photoOf } from "@/lib/format";
import { shrinkPhoto } from "@/lib/photo";
import { rawCourseHandicap } from "@/lib/routing";
import { useDesk } from "@/lib/store/desk-store";

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
      <div className="stack">
        <h1>Player not found</h1>
        <p className="muted">This player is not in the tournament any more.</p>
        <Link className="btn ghost" href="/players">
          Back to players
        </Link>
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

  return (
    <div className="stack">
      <p>
        <Link href="/players">← All players</Link>
      </p>

      <PlayerCard player={player} reg={reg} names={names} profileLink={false} />

      <section className="card stack">
        <h2>Handicap</h2>
        <p>
          The <b>Handicap Index</b> comes from NGAP and travels with the player. The{" "}
          <b>playing handicap</b> is worked out for the tee they play, and is what counts on the
          day.
        </p>
        {raw !== null && tee && player.index !== null ? (
          <p className="calc mono">
            {fmtIndex(player.index)} × ({tee.slope} ÷ 113) + ({tee.courseRating} − {tee.par}) ={" "}
            {raw.toFixed(1)}
            {state.config.allowance !== 1 && ` × ${Math.round(state.config.allowance * 100)}%`} →{" "}
            <b>{fmtHcp(reg.playingHandicap)}</b>
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
            Uses the {tee.name} tee ratings entered in this demo. They are placeholders until the
            club’s real Course Rating, Slope and Par are entered.
          </p>
        )}
      </section>

      <section className="card stack">
        <h2>This tournament</h2>
        <dl className="facts">
          <div>
            <dt>Entry</dt>
            <dd>
              {reg.status === "ok"
                ? "Ready"
                : reg.status === "ineligible"
                  ? "Not eligible"
                  : "Needs review"}
            </dd>
          </div>
          <div>
            <dt>Group</dt>
            <dd>
              {group
                ? `${shotgun ? "Hole" : "Tee"} ${group.startHole} · ${fmtTime(group.time)}`
                : state.draw
                  ? "Not in a group"
                  : "Draw not made yet"}
            </dd>
          </div>
          <div>
            <dt>NGAP ID</dt>
            <dd className="mono">{player.ngapId ?? "—"}</dd>
          </div>
          <div>
            <dt>T-shirt</dt>
            <dd>{player.shirt ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="card stack">
        <h2>Scoring record</h2>
        <p className="muted">
          No scores are recorded for this player. Scoring is not part of this version, so scoring
          averages, rounds played and past results are left out rather than estimated. They will
          appear here once scorecards are entered.
        </p>
      </section>

      <section className="card stack">
        <h2>Photo</h2>
        <div className="row">
          {photo ? (
            <img className="thumb" src={photo} alt={`${player.name}`} />
          ) : (
            <p className="muted">No photo on file with the player’s agreement.</p>
          )}
        </div>
        <label className="field">
          <span>{photo ? "Replace photo" : "Add photo"}</span>
          <input
            type="file"
            accept="image/*"
            capture="user"
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
          <p className="hint" role="alert">
            {photoError}
          </p>
        )}
        {pending && (
          <>
            <label className="check">
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
            <div className="row">
              <button
                type="button"
                className="btn"
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
              </button>
              <button type="button" className="btn ghost" onClick={() => setPending(undefined)}>
                Cancel
              </button>
            </div>
          </>
        )}
        {photo && !pending && (
          <div>
            <button
              type="button"
              className="btn small ghost"
              onClick={() =>
                dispatch({
                  type: "updatePlayer",
                  id: player.id,
                  patch: { photo: undefined, photoConsent: undefined },
                })
              }
            >
              Remove photo
            </button>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>Past tournaments</h2>
        <p className="muted">No earlier tournaments are recorded for this player here.</p>
      </section>

      <section className="stack">
        <h2>Poster</h2>
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
