import { describe, expect, it } from "vitest";
import { createDemoScanInboxRepository, type ScanUploadFile } from "@/lib/data/scan-inbox";
import { createDemoScoringRepository, type ScoringRoundSeed } from "@/lib/data/scoring";
import { makeSnapshotFor, TEST_COURSE, TEST_POLICY } from "@/lib/scoring/__tests__/fixtures";
import type { MarkerPoolPlayer } from "@/lib/scoring/inbox";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

const ROSTER: readonly MarkerPoolPlayer[] = [
  { playerId: "p1", name: "GORMLEY, ANNE", group: "1A", teamId: "team-a", position: 1 },
  { playerId: "p2", name: "LIM, BEN", group: "1A", teamId: "team-b", position: 2 },
  { playerId: "p3", name: "ROSALES, CARA", group: "1A", teamId: "team-b", position: 3 },
];

function seed(): ScoringRoundSeed {
  return {
    roundId: TEST_COURSE.roundId,
    tournamentId: "t1",
    dayNumber: 1,
    course: TEST_COURSE,
    policy: TEST_POLICY,
    players: [
      {
        registrationId: "reg-p1",
        playerId: "p1",
        playerName: "GORMLEY, ANNE",
        flightId: "f1",
        handicap: makeSnapshotFor(10),
      },
      {
        registrationId: "reg-p2",
        playerId: "p2",
        playerName: "LIM, BEN",
        flightId: "f1",
        handicap: makeSnapshotFor(12),
      },
      {
        registrationId: "reg-p3",
        playerId: "p3",
        playerName: "ROSALES, CARA",
        flightId: "f1",
        handicap: makeSnapshotFor(14),
      },
    ],
  };
}

function repository(markerPool: readonly MarkerPoolPlayer[] = ROSTER) {
  let next = 0;
  let now = 0;
  return createDemoScanInboxRepository({
    scoring: createDemoScoringRepository(seed()),
    markerPool: () => markerPool,
    actor: "desk-anna",
    idFactory: () => `scan-${(next += 1)}`,
    now: () => (now += 1000),
  });
}

function file(name: string, sha256: string): ScanUploadFile {
  return {
    path: `club-1/${name}.jpg`,
    sha256,
    mime: "image/jpeg",
    bytes: 1024,
  };
}

function reading() {
  return {
    engine: "test-reader",
    engineVersion: "1.0",
    name: "Gormley",
    writtenTotal: 78,
    holes: [
      { hole: 1, strokes: 4, confidence: 0.9 },
      { hole: 2, strokes: 0, pickedUp: true, confidence: 0.8 },
    ],
    readAt: "2026-11-13T08:00:00.000Z",
  };
}

async function uploadedScan(repo: ReturnType<typeof repository>, hash = HASH_A) {
  const result = await repo.upload("t1", [file("front", hash)], 1);
  const scanId = result.added[0]?.scanId;
  if (!scanId) throw new Error("The test upload did not create a scan.");
  return scanId;
}

describe("demo scan inbox repository", () => {
  it("creates new photos and skips a repeat in the batch and one already in the inbox", async () => {
    const repo = repository();

    const first = await repo.upload(
      "t1",
      [file("front", HASH_A), file("front-copy", HASH_A), file("back", HASH_B)],
      1,
    );

    expect(first.added.map((entry) => entry.path)).toEqual(["club-1/front.jpg", "club-1/back.jpg"]);
    expect(first.skipped).toHaveLength(1);
    expect(first.skipped[0]?.reason).toContain("club-1/front.jpg");
    expect(first.view.rows).toHaveLength(2);
    // Newest first.
    expect(first.view.rows[0]?.scan.image?.path).toBe("club-1/back.jpg");

    const second = await repo.upload("t1", [file("front-again", HASH_A)], 1);

    expect(second.added).toEqual([]);
    expect(second.skipped).toEqual([
      { path: "club-1/front-again.jpg", sha256: HASH_A, reason: "already in the inbox" },
    ]);
    expect(second.view.rows).toHaveLength(2);
  });

  it("records a reading and proposes the matching player first", async () => {
    const repo = repository();
    const scanId = await uploadedScan(repo);

    const view = await repo.recordReading("t1", scanId, reading(), 1);
    const row = view.rows.find((candidate) => candidate.scan.id === scanId);

    expect(row?.scan.state).toBe("read");
    expect(row?.scan.reading?.holes[1]).toMatchObject({ pickedUp: true, strokes: 0 });
    expect(row?.scan.suggestions[0]?.playerId).toBe("p1");
    // A reading on its own never picks a player.
    expect(row?.scan.playerId).toBeNull();
    expect(row?.readiness.canConfirm).toBe(false);
  });

  it("matches, confirms with a marker and attaches a card the desk created", async () => {
    const repo = repository();
    const scanId = await uploadedScan(repo);
    await repo.recordReading("t1", scanId, reading(), 1);

    const matched = await repo.match("t1", scanId, "p1", 1);
    expect(matched.rows[0]?.scan).toMatchObject({ state: "matched", playerId: "p1" });

    const confirmed = await repo.confirm("t1", scanId, "p2", 1);
    expect(confirmed.rows[0]?.scan).toMatchObject({
      state: "confirmed",
      playerId: "p1",
      markerId: "p2",
      confirmedBy: "desk-anna",
    });

    const attached = await repo.attachCard("t1", scanId, "card-9", 1);
    expect(attached.rows[0]?.scan).toMatchObject({
      state: "card_created",
      scorecardId: "card-9",
    });
  });

  it("clears a match back to read", async () => {
    const repo = repository();
    const scanId = await uploadedScan(repo);
    await repo.recordReading("t1", scanId, reading(), 1);
    await repo.match("t1", scanId, "p1", 1);

    const cleared = await repo.clearMatch("t1", scanId, 1);

    expect(cleared.rows[0]?.scan).toMatchObject({ state: "read", playerId: null });
  });

  it("sets a read scan aside and restores it to read", async () => {
    const repo = repository();
    const scanId = await uploadedScan(repo);
    await repo.recordReading("t1", scanId, reading(), 1);

    const parked = await repo.setAside("t1", scanId, "Photo is blurry", 1);
    expect(parked.rows[0]?.scan.state).toBe("set_aside");
    expect(parked.rows[0]?.scan.setAside).toMatchObject({
      reason: "Photo is blurry",
      by: "desk-anna",
    });

    const restored = await repo.restore("t1", scanId, 1);
    expect(restored.rows[0]?.scan.state).toBe("read");
    expect(restored.rows[0]?.scan.setAside).toBeNull();
  });

  it("restores a scan without a reading to uploaded", async () => {
    const repo = repository();
    const scanId = await uploadedScan(repo);
    await repo.setAside("t1", scanId, "Not a card", 1);

    const restored = await repo.restore("t1", scanId, 1);

    expect(restored.rows[0]?.scan.state).toBe("uploaded");
  });

  it("refuses confirm on an uploaded scan with the state rule's message", async () => {
    const repo = repository();
    const scanId = await uploadedScan(repo);

    await expect(repo.confirm("t1", scanId, "p2", 1)).rejects.toThrow(
      "Only a matched scan can be confirmed.",
    );
  });

  it("refuses every change after a card is attached", async () => {
    const repo = repository();
    const scanId = await uploadedScan(repo);
    await repo.recordReading("t1", scanId, reading(), 1);
    await repo.match("t1", scanId, "p1", 1);
    await repo.confirm("t1", scanId, "p2", 1);
    await repo.attachCard("t1", scanId, "card-9", 1);

    await expect(repo.recordReading("t1", scanId, reading(), 1)).rejects.toThrow(
      "A reading can only be recorded on a new or read scan.",
    );
    await expect(repo.match("t1", scanId, "p2", 1)).rejects.toThrow(
      "This scan can no longer be matched to a player.",
    );
    await expect(repo.setAside("t1", scanId, "Too late", 1)).rejects.toThrow(
      "This scan cannot be set aside.",
    );
  });

  it("assigns the one other-team candidate as the marker", async () => {
    const roster: MarkerPoolPlayer[] = [
      { playerId: "p1", name: "GORMLEY, ANNE", group: "1A", teamId: "team-a" },
      { playerId: "p2", name: "LIM, BEN", group: "1A", teamId: "team-b" },
    ];
    const repo = repository(roster);
    const scanId = await uploadedScan(repo);
    await repo.recordReading("t1", scanId, reading(), 1);
    await repo.match("t1", scanId, "p1", 1);

    const marker = await repo.assignMarker("t1", scanId, 1);

    expect(marker.assignedMarkerId).toBe("p2");
    expect(marker.reason).toBeNull();
  });

  it("assigns the first other-team player in group order", async () => {
    const roster: MarkerPoolPlayer[] = [
      { playerId: "p1", name: "GORMLEY, ANNE", group: "1A", teamId: "team-a", position: 1 },
      { playerId: "p2", name: "LIM, BEN", group: "1A", teamId: "team-b", position: 3 },
      { playerId: "p3", name: "ROSALES, CARA", group: "1A", teamId: "team-b", position: 2 },
    ];
    const repo = repository(roster);
    const scanId = await uploadedScan(repo);
    await repo.recordReading("t1", scanId, reading(), 1);
    await repo.match("t1", scanId, "p1", 1);

    const marker = await repo.assignMarker("t1", scanId, 1);

    expect(marker.assignedMarkerId).toBe("p3");
  });

  it("fills no marker when the group order is unknown", async () => {
    const roster: MarkerPoolPlayer[] = [
      { playerId: "p1", name: "GORMLEY, ANNE", group: "1A", teamId: "team-a" },
      { playerId: "p2", name: "LIM, BEN", group: "1A", teamId: "team-b" },
      { playerId: "p3", name: "ROSALES, CARA", group: "1A", teamId: "team-b" },
    ];
    const repo = repository(roster);
    const scanId = await uploadedScan(repo);
    await repo.recordReading("t1", scanId, reading(), 1);
    await repo.match("t1", scanId, "p1", 1);

    const marker = await repo.assignMarker("t1", scanId, 1);

    expect(marker.assignedMarkerId).toBeNull();
    expect(marker.candidates.map((candidate) => candidate.playerId)).toEqual(["p2", "p3"]);
  });

  it("fills no marker when the group has no other team", async () => {
    const roster: MarkerPoolPlayer[] = [
      { playerId: "p1", name: "GORMLEY, ANNE", group: "1A", teamId: "team-a" },
      { playerId: "p2", name: "LIM, BEN", group: "1A", teamId: "team-a" },
    ];
    const repo = repository(roster);
    const scanId = await uploadedScan(repo);
    await repo.recordReading("t1", scanId, reading(), 1);
    await repo.match("t1", scanId, "p1", 1);

    const marker = await repo.assignMarker("t1", scanId, 1);

    expect(marker.assignedMarkerId).toBeNull();
    expect(marker.reason).toBe("no_candidates");
  });

  it("never writes when assigning a marker", async () => {
    const repo = repository();
    const scanId = await uploadedScan(repo);
    await repo.recordReading("t1", scanId, reading(), 1);
    await repo.match("t1", scanId, "p1", 1);
    const before = await repo.list("t1", 1);

    await repo.assignMarker("t1", scanId, 1);
    const after = await repo.list("t1", 1);

    expect(after.rows.map((row) => row.scan)).toEqual(before.rows.map((row) => row.scan));
  });
});
