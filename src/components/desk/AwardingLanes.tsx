"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  buildTeamLeaderboard,
  loadPublicTeamLeaderboard,
} from "@/lib/data/public-team-leaderboard";
import { refreshPublicPage } from "@/lib/data/supabase/draw-sync";
import { loadLaneReveal, saveLaneReveal } from "@/lib/data/supabase/results-blackout";
import { sampleTeamLeaderboardData } from "@/lib/demo/public-leaderboard";
import { buildAwardingBoards, laneTitle } from "@/lib/public/awarding";
import {
  type AwardingBoard,
  formatCountdown,
  type LaneReveal,
  type LaneRevealMap,
  laneRemainingMs,
  parseLaneRevealMap,
  REVEAL_DEFAULT_SECONDS,
  REVEAL_LANES,
  REVEAL_MAX_SECONDS,
  REVEAL_MIN_SECONDS,
  type RevealLaneId,
  revealAtFromSeconds,
  revealSeconds,
} from "@/lib/public/results-reveal";
import { useDesk } from "@/lib/store/desk-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { cn } from "@/lib/ui/cn";

/**
 * The awarding desk: six lanes, one row each, held or released on its own.
 *
 * Each row shows the lane's state, the scheduled time, and the top three it would publish. The board
 * is built from the published team standings when the desk opens the page, and the desk looks at it
 * before releasing: releasing stores that confirmed board with the lane, so the public page prints
 * what the desk saw, including the `T` marks, and never ranks anything itself.
 *
 * A hold keeps the board and drops the countdown. A release in N seconds stores the time; this page
 * finishes the release when the server's clock reaches it, so the public pages and the podium change
 * together. If this page is closed mid-countdown, the lane simply stays held: the stored lane state
 * is the gate, and the next visit finishes it.
 *
 * The desk screens are English only (decision 18), so none of this copy is translated.
 */
export function AwardingLanes({ serverNow }: { serverNow: string }) {
  const { member, tournament, status } = useDesk();
  const connected = isSupabaseConfigured() && status !== "demo";
  const canEdit = !connected || member?.role === "owner" || member?.role === "organizer";

  const [lanes, setLanes] = useState<LaneRevealMap>(() => parseLaneRevealMap(null));
  const [proposals, setProposals] = useState<Record<RevealLaneId, AwardingBoard> | null>(null);
  const [loading, setLoading] = useState(connected);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<RevealLaneId | null>(null);
  const [seconds, setSeconds] = useState<Record<string, string>>(() =>
    Object.fromEntries(REVEAL_LANES.map((lane) => [lane.id, String(REVEAL_DEFAULT_SECONDS)])),
  );
  const [now, setNow] = useState(0);
  const mountedAt = useRef(0);
  const finishing = useRef(new Set<RevealLaneId>());

  // One tick a second for the desk's own countdown. The number itself is measured from the server's
  // render time, so a desk clock that is a few minutes out does not release early or late.
  useEffect(() => {
    mountedAt.current = Date.now();
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    if (!connected || !tournament) return;
    setLoading(true);
    setError("");
    try {
      const client = createSupabaseBrowserClient();
      const stored = await loadLaneReveal(client, tournament.id);
      setLanes(stored);
      try {
        // The standings are the same published read the public board uses. While the desk holds the
        // leaderboard key this answers nothing, and the boards already stored are what stays on
        // screen: the page never guesses a winner it cannot read.
        const data = await loadPublicTeamLeaderboard(client);
        setProposals(data ? buildAwardingBoards(buildTeamLeaderboard(data).teams) : null);
      } catch {
        setProposals(null);
      }
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "Could not load the lanes.");
    } finally {
      setLoading(false);
    }
  }, [connected, tournament]);

  useEffect(() => {
    if (!connected) {
      // The demo has its sample boards and runs the public release on a fixed loop.
      setProposals(buildAwardingBoards(buildTeamLeaderboard(sampleTeamLeaderboardData()).teams));
      setLoading(false);
      return;
    }
    void load();
  }, [connected, load]);

  const remainingOf = useCallback(
    (lane: LaneReveal): number | null =>
      laneRemainingMs({
        lane,
        serverNow,
        receivedAt: mountedAt.current,
        now,
      }),
    [now, serverNow],
  );

  /** The board a lane will publish: what the desk confirmed, or the one on screen to confirm now. */
  const boardFor = useCallback(
    (laneId: RevealLaneId, lane: LaneReveal): AwardingBoard =>
      lane.board.length > 0 ? lane.board : (proposals?.[laneId] ?? []),
    [proposals],
  );

  const write = useCallback(
    async (laneId: RevealLaneId, next: LaneReveal) => {
      if (!connected || !tournament) {
        setLanes((previous) => ({ ...previous, [laneId]: next }));
        return;
      }
      const client = createSupabaseBrowserClient();
      await saveLaneReveal(client, tournament.id, laneId, next);
      await refreshPublicPage(client);
      setLanes((previous) => ({ ...previous, [laneId]: next }));
    },
    [connected, tournament],
  );

  const release = useCallback(
    async (laneId: RevealLaneId) => {
      if (!canEdit || busy) return;
      setBusy(laneId);
      setError("");
      setNotice("");
      try {
        const lane = lanes[laneId];
        const board = boardFor(laneId, lane);
        if (board.length === 0) {
          setError(`${laneTitle(laneId)} has no confirmed board yet.`);
          return;
        }
        await write(laneId, { state: "released", releaseAt: null, board });
        setNotice(`${laneTitle(laneId)} released.`);
      } catch (writeError) {
        setError(writeError instanceof Error ? writeError.message : "Could not release the lane.");
      } finally {
        finishing.current.delete(laneId);
        setBusy(null);
      }
    },
    [boardFor, busy, canEdit, lanes, write],
  );

  const hold = useCallback(
    async (laneId: RevealLaneId) => {
      if (!canEdit || busy) return;
      setBusy(laneId);
      setError("");
      setNotice("");
      try {
        const lane = lanes[laneId];
        await write(laneId, { state: "held", releaseAt: null, board: lane.board });
        setNotice(`${laneTitle(laneId)} held.`);
      } catch (writeError) {
        setError(writeError instanceof Error ? writeError.message : "Could not hold the lane.");
      } finally {
        setBusy(null);
      }
    },
    [busy, canEdit, lanes, write],
  );

  /**
   * The server's clock, now. A countdown the desk starts is stored against this, not against the
   * desk laptop's clock, so the public page and the desk reach zero together.
   */
  const serverClockMs = useCallback(() => {
    const base = Date.parse(serverNow);
    if (!Number.isFinite(base)) return Date.now();
    return base + (Date.now() - mountedAt.current);
  }, [serverNow]);

  const countdown = useCallback(
    async (laneId: RevealLaneId) => {
      if (!canEdit || busy) return;
      const count = revealSeconds(seconds[laneId]);
      setSeconds((previous) => ({ ...previous, [laneId]: String(count) }));
      setBusy(laneId);
      setError("");
      setNotice("");
      try {
        const lane = lanes[laneId];
        const releaseAt = revealAtFromSeconds(count, serverClockMs());
        await write(laneId, {
          state: "held",
          releaseAt,
          board: boardFor(laneId, lane),
        });
        setNotice(`${laneTitle(laneId)} releases in ${count} seconds.`);
      } catch (writeError) {
        setError(
          writeError instanceof Error ? writeError.message : "Could not start the countdown.",
        );
      } finally {
        setBusy(null);
      }
    },
    [boardFor, busy, canEdit, lanes, seconds, serverClockMs, write],
  );

  // The page finishes one countdown at a time on the server's clock.
  useEffect(() => {
    if (now === 0 || busy !== null) return;
    const due = REVEAL_LANES.find((lane) => {
      const value = lanes[lane.id];
      if (value.state !== "held" || !value.releaseAt) return false;
      const remaining = remainingOf(value);
      return remaining !== null && remaining <= 0;
    });
    if (!due || finishing.current.has(due.id)) return;
    finishing.current.add(due.id);
    void release(due.id);
  }, [busy, lanes, now, release, remainingOf]);

  return (
    <main className="grid gap-4 p-4">
      <PageHeader overline="Awarding" title="Awarding lanes">
        <p className="m-0">
          Hold or release each class on its own. Releasing one lane never releases another.
        </p>
      </PageHeader>

      {!canEdit && (
        <p className="notice warn m-0" role="status">
          Only an owner or organizer can hold or release a lane. You can still see the state.
        </p>
      )}
      {!connected && (
        <p className="notice m-0" role="note">
          Demo preview: the public page runs the sample release sequence on a fixed loop. No live
          event is changed here.
        </p>
      )}
      {error && (
        <p className="notice bad m-0" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice m-0" role="status">
          {notice}
        </p>
      )}

      <SectionCard
        id="awarding-lanes"
        title="Six lanes"
        subtitle="Each board is the top three the desk confirms before the lane is released."
      >
        {loading ? (
          <p className="hint m-0">Loading the lanes…</p>
        ) : (
          <div className="grid gap-3" data-testid="awarding-lanes">
            {REVEAL_LANES.map((lane) => {
              const value = lanes[lane.id];
              const remaining = remainingOf(value);
              const board = boardFor(lane.id, value);
              const stored = value.board.length > 0;
              return (
                <section
                  key={lane.id}
                  className="rounded-[10px] border border-line bg-surface-raised px-3 py-3"
                  data-testid={`awarding-admin-${lane.id}`}
                  data-state={value.state}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="m-0 text-[15px] font-semibold text-ink">{lane.label}</h3>
                    <span className={cn("pill", value.state === "held" ? "warn" : "ok")}>
                      {value.state === "held" ? "Held" : "Released"}
                    </span>
                    {value.releaseAt && (
                      <span className="pill info">
                        {remaining === null || remaining > 0
                          ? `Releases in ${formatCountdown(remaining)}`
                          : "Releasing…"}
                      </span>
                    )}
                    {value.releaseAt && (
                      <span className="hint m-0">
                        at{" "}
                        {new Date(value.releaseAt).toLocaleTimeString("en-PH", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    )}
                    {!stored && board.length > 0 && (
                      <span className="hint m-0">board not confirmed yet</span>
                    )}
                  </div>

                  {board.length === 0 ? (
                    <p className="hint m-0 mt-2">
                      No board yet. Publish the rounds, or release the leaderboard key so the
                      standings can be read, then open this page again.
                    </p>
                  ) : (
                    <ol className="mt-2 grid gap-1">
                      {board.map((row) => (
                        <li
                          key={`${row.position}-${row.name}`}
                          className="flex items-baseline gap-2 text-[14px]"
                          data-testid="awarding-admin-row"
                        >
                          <span className="w-6 text-ink-muted tabular-nums">
                            {row.position}
                            {row.tie ? "T" : ""}
                          </span>
                          <span className="flex-1 text-ink">{row.name}</span>
                          <span className="font-semibold text-ink tabular-nums">
                            {row.score ?? ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      variant="gold"
                      size="sm"
                      disabled={!canEdit || busy !== null}
                      onClick={() => void release(lane.id)}
                      data-testid={`awarding-release-${lane.id}`}
                    >
                      Release now
                    </Button>
                    <label className="flex items-center gap-2 text-[13px] text-ink-muted">
                      <span className="sr-only">{`Seconds until ${lane.label} is released`}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={REVEAL_MIN_SECONDS}
                        max={REVEAL_MAX_SECONDS}
                        step={1}
                        value={seconds[lane.id] ?? String(REVEAL_DEFAULT_SECONDS)}
                        onChange={(event) =>
                          setSeconds((previous) => ({
                            ...previous,
                            [lane.id]: event.target.value,
                          }))
                        }
                        disabled={!canEdit || busy !== null}
                        aria-label={`Seconds until ${lane.label} is released`}
                        data-testid={`awarding-seconds-${lane.id}`}
                        className="h-9 w-20 rounded-md border border-line-strong bg-surface px-2 text-center text-[14px] text-ink"
                      />
                      <span>seconds</span>
                    </label>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!canEdit || busy !== null}
                      onClick={() => void countdown(lane.id)}
                      data-testid={`awarding-countdown-${lane.id}`}
                    >
                      Release in N seconds
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canEdit || busy !== null || value.state === "held"}
                      onClick={() => void hold(lane.id)}
                      data-testid={`awarding-hold-${lane.id}`}
                    >
                      Hold
                    </Button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </SectionCard>
    </main>
  );
}
