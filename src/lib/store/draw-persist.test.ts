import { describe, expect, it } from "vitest";
import { planDrawJobs } from "./draw-persist";
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
    const jobs = plan(published(), { type: "generate", preserveLocks: false });
    expect(jobs.map((j) => j.kind)).toEqual(["save", "unpublish"]);
  });

  it("keeps the public page up when locks are preserved", () => {
    const jobs = plan(published(), { type: "generate", preserveLocks: true });
    expect(jobs.map((j) => j.kind)).toEqual(["save"]);
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

  it("ignores actions that do not touch the draw", () => {
    expect(plan(generated(), { type: "hydrate", state: generated() })).toEqual([]);
  });
});
