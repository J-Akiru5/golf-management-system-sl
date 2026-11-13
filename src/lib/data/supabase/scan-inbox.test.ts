import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createDemoScoringRepository, type ScoringRoundSeed } from "@/lib/data/scoring";
import { createSupabaseScanInboxRepository } from "@/lib/data/supabase/scan-inbox";
import { makeSnapshotFor, TEST_COURSE, TEST_POLICY } from "@/lib/scoring/__tests__/fixtures";
import type { Database as AppDatabase } from "@/lib/supabase/types";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

type Row = Record<string, unknown>;

function scoringSeed(): ScoringRoundSeed {
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
    ],
  };
}

function scoringSource() {
  return createDemoScoringRepository(scoringSeed());
}

function scanRow(overrides: Row = {}): Row {
  return {
    id: "scan-1",
    club_id: "club-1",
    round_id: TEST_COURSE.roundId,
    storage_path: "club-1/scan-1.jpg",
    sha256: HASH_A,
    mime_type: "image/jpeg",
    byte_size: 1024,
    reader_engine: null,
    reader_engine_version: null,
    reader_name: null,
    reader_written_total: null,
    reader_holes: null,
    reader_raw: null,
    read_at: null,
    candidates: [],
    state: "uploaded",
    player_id: null,
    marker_id: null,
    confirmed_by: null,
    confirmed_at: null,
    scorecard_id: null,
    set_aside_reason: null,
    set_aside_by: null,
    set_aside_at: null,
    created_by: null,
    created_at: "2026-11-13T08:00:00.000Z",
    updated_at: "2026-11-13T08:00:00.000Z",
    ...overrides,
  };
}

type Reply = { data: unknown; error: { message: string } | null };

function fakeClient(seedRows: readonly Row[] = []) {
  const rows = seedRows.map((row) => ({ ...row }));
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const replies = new Map<string, Reply>();

  function chain() {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      then: (resolve: (value: { data: Row[]; error: null }) => unknown, reject?: unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve, reject as never),
    };
    return query;
  }

  const client = {
    from: () => chain(),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return replies.get(name) ?? { data: null, error: null };
    },
  };

  return {
    client: client as unknown as SupabaseClient<AppDatabase>,
    rpcCalls,
    rows,
    reply: (name: string, reply: Reply) => replies.set(name, reply),
  };
}

function repository(seedRows: readonly Row[] = []) {
  const fake = fakeClient(seedRows);
  const repo = createSupabaseScanInboxRepository({
    client: fake.client,
    scoring: scoringSource(),
  });
  return { repo, fake };
}

const READING = {
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

function file(path: string, sha256: string) {
  return { path, sha256, mime: "image/jpeg", bytes: 1024 };
}

describe("connected scan inbox repository", () => {
  it("maps rows to records with nulls and works out suggestions and readiness", async () => {
    const { repo } = repository([
      scanRow({
        id: "scan-read",
        state: "read",
        reader_engine: "test-reader",
        reader_engine_version: "1.0",
        reader_name: "Gormley",
        reader_written_total: 78,
        reader_holes: [{ hole: 1, strokes: 4, confidence: 0.9 }],
        read_at: "2026-11-13T08:00:00.000Z",
      }),
      scanRow({ id: "scan-uploaded" }),
    ]);

    const view = await repo.list("t1", 1);
    const read = view.rows.find((row) => row.scan.id === "scan-read")?.scan;
    const uploaded = view.rows.find((row) => row.scan.id === "scan-uploaded")?.scan;

    expect(read?.state).toBe("read");
    expect(read?.reading).toMatchObject({
      engine: "test-reader",
      engineVersion: "1.0",
      name: "Gormley",
      writtenTotal: 78,
      readAt: "2026-11-13T08:00:00.000Z",
    });
    expect(read?.reading?.holes).toEqual([{ hole: 1, strokes: 4, confidence: 0.9 }]);
    expect(read?.suggestions[0]?.playerId).toBe("p1");
    expect(read?.playerId).toBeNull();
    expect(read?.markerId).toBeNull();
    expect(read?.confirmedBy).toBeNull();
    expect(read?.confirmedAt).toBeNull();
    expect(read?.scorecardId).toBeNull();
    expect(read?.setAside).toBeNull();

    expect(uploaded?.reading).toBeNull();
    expect(uploaded?.suggestions).toEqual([]);
    expect(uploaded?.image).toEqual({
      path: "club-1/scan-1.jpg",
      sha256: HASH_A,
      mime: "image/jpeg",
      bytes: 1024,
    });

    for (const scan of [read, uploaded]) {
      expect(scan).toBeDefined();
      expect(Object.values(scan ?? {})).not.toContain(undefined);
    }
  });

  it("calls each of the seven functions with exactly the right argument names", async () => {
    const { repo, fake } = repository([
      scanRow({ id: "scan-read", state: "read" }),
      scanRow({
        id: "scan-matched",
        state: "matched",
        player_id: "p1",
      }),
      scanRow({
        id: "scan-matched-2",
        state: "matched",
        player_id: "p1",
      }),
      scanRow({
        id: "scan-confirmed",
        state: "confirmed",
        player_id: "p1",
        marker_id: "p2",
        confirmed_by: "user-1",
        confirmed_at: "2026-11-13T08:00:00.000Z",
      }),
      scanRow({
        id: "scan-set-aside",
        state: "set_aside",
        reader_name: "Gormley",
        read_at: "2026-11-13T08:00:00.000Z",
        set_aside_reason: "Blurry",
        set_aside_by: "user-1",
        set_aside_at: "2026-11-13T08:00:00.000Z",
      }),
    ]);

    await repo.recordReading("t1", "scan-read", READING, 1);
    await repo.match("t1", "scan-read", "p1", 1);
    await repo.clearMatch("t1", "scan-matched", 1);
    await repo.confirm("t1", "scan-matched-2", "p2", 1);
    await repo.setAside("t1", "scan-read", "Blurry photo", 1);
    await repo.restore("t1", "scan-set-aside", 1);
    await repo.attachCard("t1", "scan-confirmed", "card-9", 1);

    const names = fake.rpcCalls.map((call) => call.name);
    expect(names).toEqual([
      "record_scan_reading",
      "match_scorecard_scan",
      "match_scorecard_scan",
      "confirm_scorecard_scan",
      "set_aside_scorecard_scan",
      "restore_scorecard_scan",
      "attach_scan_card",
    ]);

    const readingArgs = fake.rpcCalls[0]?.args;
    expect(Object.keys(readingArgs ?? {}).sort()).toEqual([
      "p_candidates",
      "p_engine",
      "p_engine_version",
      "p_holes",
      "p_name",
      "p_raw",
      "p_scan",
      "p_written_total",
    ]);
    expect(readingArgs).toMatchObject({
      p_scan: "scan-read",
      p_engine: "test-reader",
      p_engine_version: "1.0",
      p_name: "Gormley",
      p_written_total: 78,
      p_raw: null,
    });
    expect(readingArgs?.p_holes).toEqual([
      { hole: 1, strokes: 4, confidence: 0.9 },
      { hole: 2, strokes: 0, picked_up: true, confidence: 0.8 },
    ]);
    expect((readingArgs?.p_candidates as Row[])[0]).toMatchObject({
      playerId: "p1",
      hasCard: false,
    });

    expect(fake.rpcCalls[1]?.args).toEqual({ p_player: "p1", p_scan: "scan-read" });
    expect(fake.rpcCalls[2]?.args).toEqual({ p_player: null, p_scan: "scan-matched" });
    expect(fake.rpcCalls[3]?.args).toEqual({ p_marker: "p2", p_scan: "scan-matched-2" });
    expect(fake.rpcCalls[4]?.args).toEqual({
      p_reason: "Blurry photo",
      p_scan: "scan-read",
    });
    expect(fake.rpcCalls[5]?.args).toEqual({ p_scan: "scan-set-aside" });
    expect(fake.rpcCalls[6]?.args).toEqual({ p_card: "card-9", p_scan: "scan-confirmed" });
  });

  it("creates each new photo and sends nothing for a duplicate", async () => {
    const { repo, fake } = repository([scanRow({ id: "scan-old", sha256: HASH_A })]);
    fake.reply("create_scorecard_scan", { data: "scan-new", error: null });

    const result = await repo.upload(
      "t1",
      [
        file("club-1/front.jpg", HASH_A),
        file("club-1/back.jpg", HASH_B),
        file("club-1/back-copy.jpg", HASH_B),
      ],
      1,
    );

    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0]?.name).toBe("create_scorecard_scan");
    expect(fake.rpcCalls[0]?.args).toEqual({
      p_bytes: 1024,
      p_mime: "image/jpeg",
      p_round: TEST_COURSE.roundId,
      p_sha256: HASH_B,
      p_storage_path: "club-1/back.jpg",
    });
    expect(result.added).toEqual([{ path: "club-1/back.jpg", sha256: HASH_B, scanId: "scan-new" }]);
    expect(result.skipped.map((entry) => entry.reason)).toEqual([
      "already in the inbox",
      "same as club-1/back.jpg",
    ]);
  });

  it("turns a function error into a plain-language Error", async () => {
    const { repo, fake } = repository([
      scanRow({ id: "scan-matched", state: "matched", player_id: "p1" }),
    ]);
    fake.reply("confirm_scorecard_scan", {
      data: null,
      error: { message: "Only a matched scan can be confirmed" },
    });

    await expect(repo.confirm("t1", "scan-matched", "p2", 1)).rejects.toThrow(
      "Could not confirm the scan: Only a matched scan can be confirmed",
    );
  });

  it("refuses a move the state machine refuses before calling the database", async () => {
    const { repo, fake } = repository([scanRow({ id: "scan-uploaded" })]);

    await expect(repo.confirm("t1", "scan-uploaded", "p2", 1)).rejects.toThrow(
      "Only a matched scan can be confirmed.",
    );
    expect(fake.rpcCalls).toEqual([]);
  });

  it("assigns no marker and writes nothing when the caller has no group data", async () => {
    const { repo, fake } = repository([
      scanRow({ id: "scan-matched", state: "matched", player_id: "p1" }),
    ]);

    const marker = await repo.assignMarker("t1", "scan-matched", 1);

    expect(marker.assignedMarkerId).toBeNull();
    expect(marker.reason).toBe("no_candidates");
    expect(marker.message).toContain("not loaded");
    expect(fake.rpcCalls).toEqual([]);
  });
});
