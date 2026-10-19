import { describe, expect, it } from "vitest";
import type { LoadedDesk } from "@/lib/data/supabase/load-desk-state";
import type { PlayerRecord } from "@/lib/data/types";
import type { PortalState } from "@/lib/player/portal";
import type { DeskState } from "@/lib/store/state";
import {
  NO_SNAPSHOT_NOTICE,
  OFFLINE_MAX_AGE_MS,
  OFFLINE_SCHEMA_VERSION,
  OFFLINE_WRITE_NOTICE,
  offlineNotice,
  readEnvelope,
  savedDateLabel,
  snapshotKey,
  stripPlayerPhoto,
  toDeskSnapshot,
  toPlayerSnapshot,
} from "./cache";

const player = (overrides: Partial<PlayerRecord> = {}): PlayerRecord => ({
  id: "p-1",
  clubId: "club-1",
  firstName: "Maria",
  lastName: "Santos",
  nickname: null,
  name: "Maria Santos",
  birthdate: "1970-04-02",
  gender: "F",
  homeCourse: "IGCC",
  contactNumber: "0917 000 0000",
  email: "maria@example.test",
  ngapId: "12345",
  photo: "data:image/png;base64,AAAA",
  photoConsent: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const deskState = (): DeskState => ({
  clubId: "club-1",
  tournaments: [],
  activeTournamentId: null,
  players: [player()],
  records: [],
  entries: [],
  batches: [],
  deferred: [],
  boards: {},
  importedCount: 0,
  seq: 0,
});

const loadedDesk = (): LoadedDesk => ({
  clubName: "Iloilo Golf & Country Club",
  revisions: { "t-1": 3 },
  state: deskState(),
});

const portal = (): PortalState => ({
  linked: true,
  player: { id: "p-1", name: "Maria Santos", ngapId: "12345" },
  entries: [
    {
      tournamentId: "t-1",
      eventName: "Bamboo Tee",
      eventDate: "2026-11-14",
      dates: ["2026-11-14"],
      startFormat: "shotgun",
      firstTeeTime: "07:00",
      state: "open",
      status: "ok",
      reasons: ["placed"],
      frozenIndex: 12.4,
      playingHandicap: 13,
      category: "Ladies",
      tee: "Red",
      flight: "Ladies A",
      paymentStatus: "paid",
      published: true,
      start: { hole: 10, wave: "A", time: "07:48" },
    },
  ],
});

describe("snapshot keys", () => {
  it("separates the desk and the player, and one account from another", () => {
    expect(snapshotKey("desk", "user-a")).toBe("desk:user-a");
    expect(snapshotKey("player", "user-a")).toBe("player:user-a");
    expect(snapshotKey("desk", "user-a")).not.toBe(snapshotKey("desk", "user-b"));
  });
});

describe("what may be cached", () => {
  it("removes the photo URL before a player is written to the phone", () => {
    const cleaned = stripPlayerPhoto(player());
    expect(cleaned.photo).toBeUndefined();
    expect(cleaned.photoConsent).toBe(true);
    expect(cleaned.contactNumber).toBe("0917 000 0000");
    // The original is untouched, so a screen already holding it keeps its photo for this visit.
    expect(player().photo).toBe("data:image/png;base64,AAAA");
  });

  it("strips photos from the whole desk snapshot and keeps the draw revision", () => {
    const snapshot = toDeskSnapshot(loadedDesk(), { displayName: "Ana", role: "desk" });
    expect(snapshot.state.players[0]?.photo).toBeUndefined();
    expect(snapshot.revisions).toEqual({ "t-1": 3 });
    expect(snapshot.member).toEqual({ displayName: "Ana", role: "desk" });
  });

  it("copies the player projection without carrying a new field by accident", () => {
    const source = portal();
    const copy = toPlayerSnapshot(source);
    expect(copy).toEqual(source);
    expect(copy.entries[0]).not.toBe(source.entries[0]);
    expect(copy.entries[0]?.reasons).not.toBe(source.entries[0]?.reasons);
  });
});

describe("envelope rules", () => {
  const now = new Date(2026, 9, 19, 8, 0);
  const valid = {
    schema: OFFLINE_SCHEMA_VERSION,
    savedAt: new Date(2026, 9, 19, 6, 42).toISOString(),
    userId: "user-a",
    clubId: "club-1",
    payload: { state: deskState() },
  };

  it("accepts a current snapshot for the same account", () => {
    const read = readEnvelope(valid, { kind: "desk", userId: "user-a", now });
    expect(read?.savedAt).toBe(valid.savedAt);
    expect(read?.clubId).toBe("club-1");
  });

  it("refuses another account, another schema, or a payload that is not an object", () => {
    expect(readEnvelope(valid, { kind: "desk", userId: "user-b", now })).toBeNull();
    expect(
      readEnvelope(
        { ...valid, schema: OFFLINE_SCHEMA_VERSION + 1 },
        {
          kind: "desk",
          userId: "user-a",
          now,
        },
      ),
    ).toBeNull();
    expect(
      readEnvelope({ ...valid, payload: "names" }, { kind: "desk", userId: "user-a", now }),
    ).toBeNull();
    expect(readEnvelope(null, { kind: "desk", userId: "user-a", now })).toBeNull();
  });

  it("refuses a snapshot older than the trusted age", () => {
    const old = {
      ...valid,
      savedAt: new Date(now.getTime() - OFFLINE_MAX_AGE_MS - 1000).toISOString(),
    };
    expect(readEnvelope(old, { kind: "desk", userId: "user-a", now })).toBeNull();
  });
});

describe("the words on a saved screen", () => {
  const now = new Date(2026, 9, 19, 8, 0);

  it("names the clock time when the copy was saved today", () => {
    const saved = new Date(2026, 9, 19, 6, 42).toISOString();
    expect(offlineNotice(saved, now)).toBe("Showing what was on screen at 6:42 AM. Not connected.");
  });

  it("names the date as well when the copy is from another day", () => {
    const saved = new Date(2026, 9, 18, 18, 5).toISOString();
    expect(offlineNotice(saved, now)).toBe(
      "Showing what was on screen on 18 Oct at 6:05 PM. Not connected.",
    );
  });

  it("includes the year once it differs", () => {
    const saved = new Date(2025, 9, 18, 6, 5).toISOString();
    expect(savedDateLabel(saved, now)).toBe("18 Oct 2025");
    expect(offlineNotice(saved, now)).toContain("on 18 Oct 2025 at 6:05 AM");
  });

  it("never guesses a time it does not have", () => {
    expect(offlineNotice("not-a-date", now)).toBe(
      "Showing the last saved copy. The time it was saved is not available. Not connected.",
    );
  });

  it("says that no copy exists, and that an offline change was not saved or queued", () => {
    expect(NO_SNAPSHOT_NOTICE).toContain("nothing to show offline");
    expect(OFFLINE_WRITE_NOTICE).toContain("was not saved");
    expect(OFFLINE_WRITE_NOTICE).toContain("Nothing is queued");
  });
});
