import { describe, expect, it } from "vitest";
import { placementOf } from "@/lib/draw/withdraw";
import { planDrawJobs, publishedWhileWritesPending } from "./draw-persist";
import { type Action, type DeskState, initialState, reducer } from "./state";

const run = (state: DeskState, action: Action) => reducer(state, action);
const plan = (state: DeskState, action: Action) => planDrawJobs(action, state, run(state, action));

function generated(): DeskState {
  return run(initialState(), { type: "generate", preserveLocks: false });
}

function published(): DeskState {
  return run(generated(), { type: "publish" });
}

describe("planDrawJobs", () => {
  it("saves the whole draw after a fresh proposal", () => {
    const jobs = plan(initialState(), { type: "generate", preserveLocks: false });
    expect(jobs).toHaveLength(1);
    const job = jobs[0];
    expect(job?.kind).toBe("save");
    if (job?.kind === "save") {
      expect(job.draw.length).toBeGreaterThan(0);
      expect(job.overrides).toEqual([]);
    }
  });

  it("publishes the frozen groups after a publish", () => {
    const jobs = plan(generated(), { type: "publish" });
    expect(jobs).toHaveLength(1);
    const job = jobs[0];
    expect(job?.kind).toBe("publish");
    if (job?.kind === "publish") {
      expect(job.published.groups.length).toBeGreaterThan(0);
      expect(job.published.signature).not.toBe("");
    }
  });

  it("queues a new publish each time, so each one gets its own version", () => {
    expect(plan(published(), { type: "publish" }).map((j) => j.kind)).toEqual(["publish"]);
  });

  it("does nothing when the publish is refused or there is nothing published to take down", () => {
    expect(plan(initialState(), { type: "publish" })).toEqual([]);
    expect(plan(generated(), { type: "unpublish" })).toEqual([]);
  });

  it("takes the public page down when a fresh proposal drops the published copy", () => {
    // The board the database already holds is unchanged, so only the unpublish is written.
    const jobs = plan(published(), { type: "generate", preserveLocks: false });
    expect(jobs.map((j) => j.kind)).toEqual(["unpublish"]);
  });

  it("keeps the old published copy on screen until a queued takedown is written", () => {
    const was = published();
    const id = was.activeTournamentId ?? "";
    const after = run(was, { type: "generate", preserveLocks: false });
    const jobs = planDrawJobs({ type: "generate", preserveLocks: false }, was, after);
    const before = was.boards[id]?.published ?? null;
    const now = after.boards[id]?.published ?? null;
    expect(now).toBeNull();
    expect(publishedWhileWritesPending(jobs, before, now)).toEqual(before);
    // Nothing is being taken down, so the screen shows what the reducer produced.
    expect(publishedWhileWritesPending([], before, now)).toBeNull();
  });

  it("writes nothing when a re-run proposes the board that is already saved", () => {
    expect(plan(published(), { type: "generate", preserveLocks: true })).toEqual([]);
  });

  it("keeps the public page up when locks are preserved", () => {
    const jobs = plan(published(), { type: "generate", preserveLocks: true });
    expect(jobs.map((j) => j.kind)).not.toContain("unpublish");
  });

  it("unpublishes only when something is published", () => {
    expect(plan(published(), { type: "unpublish" }).map((j) => j.kind)).toEqual(["unpublish"]);
  });

  it("saves the draw when a group is locked", () => {
    const state = generated();
    const group = state.boards[state.activeTournamentId ?? ""]?.draw?.[0];
    expect(group).toBeDefined();
    const jobs = plan(state, {
      type: "setGroupLocked",
      group: group?.number ?? 1,
      locked: true,
      reason: "Sponsor group",
    });
    expect(jobs.map((j) => j.kind)).toEqual(["save"]);
  });

  it("saves the board when a player is withdrawn and when they are put back", () => {
    const state = generated();
    const id = state.activeTournamentId ?? "";
    const draw = state.boards[id]?.draw ?? [];
    const playerId = draw.flatMap((group) => group.playerIds)[0] ?? "";
    expect(playerId).not.toBe("");
    const placement = placementOf(draw, playerId);
    expect(placement).not.toBeNull();
    const at = placement ?? { groupNumber: 1, index: 0 };

    expect(plan(state, { type: "withdrawFromDraw", playerId }).map((job) => job.kind)).toEqual([
      "save",
    ]);
    const withdrawn = run(state, { type: "withdrawFromDraw", playerId });
    expect(
      plan(withdrawn, { type: "restoreToDraw", playerId, placement: at }).map((job) => job.kind),
    ).toEqual(["save"]);

    const restored = run(withdrawn, { type: "restoreToDraw", playerId, placement: at });
    expect(placementOf(restored.boards[id]?.draw ?? [], playerId)).toEqual(placement);
  });

  it("saves the board when a walk-up is placed in a group", () => {
    const state = generated();
    const id = state.activeTournamentId ?? "";
    const groupNumber = state.boards[id]?.draw?.[0]?.number ?? 1;

    expect(
      plan(state, { type: "placeOnDraw", playerId: "p-walkup", groupNumber }).map(
        (job) => job.kind,
      ),
    ).toEqual(["save"]);

    const after = run(state, { type: "placeOnDraw", playerId: "p-walkup", groupNumber });
    expect(
      after.boards[id]?.draw?.find((group) => group.number === groupNumber)?.playerIds,
    ).toContain("p-walkup");
  });

  it("ignores actions that do not touch the draw", () => {
    expect(plan(generated(), { type: "hydrate", state: generated() })).toEqual([]);
  });
});
