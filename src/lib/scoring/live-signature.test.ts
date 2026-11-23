import { describe, expect, it } from "vitest";
import { createDemoScoringRepository, type ScoringRoundView } from "@/lib/data/scoring";
import { buildDemoScoringSeed } from "@/lib/demo/scoring";
import type { Scorecard } from "@/lib/scoring";
import { roundLiveSignature } from "./live-signature";

const TOURNAMENT = "bamboo-tee-2026";
const DAY = 1;

/** The demo round, read fresh: the same seed, a new object each time. */
async function demoRound(): Promise<ScoringRoundView> {
  const repository = createDemoScoringRepository(buildDemoScoringSeed());
  const view = await repository.loadRound(TOURNAMENT, DAY);
  if (!view) throw new Error("The demo round is missing.");
  return view;
}

describe("roundLiveSignature", () => {
  it("says none when the desk has no round", () => {
    expect(roundLiveSignature(null)).toBe("none");
  });

  it("is the same for an unchanged round, read twice", async () => {
    expect(roundLiveSignature(await demoRound())).toBe(roundLiveSignature(await demoRound()));
  });

  it("moves when another desk user's card arrives", async () => {
    const before = await demoRound();
    const player = before.players[0];
    if (!player) throw new Error("The demo round has no players.");
    const scorer = before.players[1] ?? player;
    const card: Scorecard = {
      id: "card-1",
      roundId: before.roundId,
      playerId: player.playerId,
      scorerId: scorer.playerId,
      source: "manual",
      revision: 1,
      status: "submitted",
      entries: [],
      writtenTotal: null,
      submittedAt: "2026-11-21T01:00:00Z",
    };
    const after: ScoringRoundView = { ...before, cards: [...before.cards, card] };
    expect(roundLiveSignature(after)).not.toBe(roundLiveSignature(before));

    // An approval of the same card is another change the other screens must see.
    const approved: ScoringRoundView = {
      ...after,
      cards: after.cards.map((item) => ({ ...item, status: "approved" as const })),
    };
    expect(roundLiveSignature(approved)).not.toBe(roundLiveSignature(after));
  });

  it("moves when a handicap snapshot is corrected", async () => {
    const before = await demoRound();
    const player = before.players[0];
    if (!player?.handicap) throw new Error("The demo round has no handicap snapshot.");
    const corrected: ScoringRoundView = {
      ...before,
      players: before.players.map((item) =>
        item.playerId === player.playerId && item.handicap
          ? {
              ...item,
              handicap: {
                ...item.handicap,
                index: item.handicap.index + 1,
                playingHandicap: item.handicap.playingHandicap + 1,
              },
            }
          : item,
      ),
    };
    expect(roundLiveSignature(corrected)).not.toBe(roundLiveSignature(before));
  });

  it("moves when a round is published or a hole is resolved", async () => {
    const before = await demoRound();
    const published: ScoringRoundView = {
      ...before,
      publications: [{ version: 1, state: "provisional", publishedAt: "2026-12-21T06:00:00Z" }],
    };
    expect(roundLiveSignature(published)).not.toBe(roundLiveSignature(before));

    const hole = before.players[0]?.canonical.holes[0];
    if (!hole) throw new Error("The demo round has no canonical holes.");
    const resolved: ScoringRoundView = {
      ...before,
      players: before.players.map((item, index) =>
        index === 0
          ? {
              ...item,
              canonical: {
                ...item.canonical,
                holes: item.canonical.holes.map((candidate) =>
                  candidate.hole === hole.hole
                    ? {
                        ...candidate,
                        status: "verified" as const,
                        strokes: (candidate.strokes ?? 4) + 1,
                      }
                    : candidate,
                ),
              },
            }
          : item,
      ),
    };
    expect(roundLiveSignature(resolved)).not.toBe(roundLiveSignature(before));
  });
});
