import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerRecord, RegistrationEntry, Tournament } from "@/lib/data/types";
import { DEMO_CONFIG } from "@/lib/demo/data";
import { type DeskState, emptyState } from "@/lib/store/state";
import type { Database, EmailOutboxRow, TableInsert } from "@/lib/supabase/types";
import { createSupabaseEmailRepository } from "./email";

const CLUB = "club-1";
const TOURNAMENT_ID = "tournament-1";
const CUT_OFF = "2026-11-01";
const SITE_URL = "https://events.example.test";

type EmailError = { code?: string; message: string };
type EmailListReply = { data: EmailOutboxRow[] | null; error: EmailError | null };
type EmailUpsertReply = { data: { id: string }[] | null; error: EmailError | null };

/**
 * A fake PostgREST client for the two queries the repository makes. It records the query chain so a
 * test can prove the club and tournament scope, and returns a fixed reply for each call.
 */
function fakeEmailClient(options: { list?: EmailListReply; upsert?: EmailUpsertReply } = {}) {
  const listReply: EmailListReply = options.list ?? { data: [], error: null };
  const upsertReply: EmailUpsertReply = options.upsert ?? { data: [], error: null };

  const limit = vi.fn().mockResolvedValue(listReply);
  const order = vi.fn(() => ({ limit }));
  const tournamentScope = vi.fn(() => ({ order }));
  const clubScope = vi.fn(() => ({ eq: tournamentScope }));
  const selectAll = vi.fn(() => ({ eq: clubScope }));
  const selectIds = vi.fn().mockResolvedValue(upsertReply);
  const upsert = vi.fn(
    (
      _rows: TableInsert<"email_outbox">[],
      _options: { onConflict: string; ignoreDuplicates: boolean },
    ) => ({ select: selectIds }),
  );

  const from = vi.fn((table: string) => {
    if (table !== "email_outbox") throw new Error(`Unexpected table ${table}`);
    return { select: selectAll, upsert };
  });

  const client = { from } as unknown as SupabaseClient<Database>;
  return {
    client,
    from,
    selectAll,
    clubScope,
    tournamentScope,
    order,
    limit,
    upsert,
    selectIds,
  };
}

const outboxRow = (over: Partial<EmailOutboxRow> = {}): EmailOutboxRow => ({
  id: "mail-1",
  club_id: CLUB,
  tournament_id: TOURNAMENT_ID,
  registration_id: "entry-1",
  recipient_email: "ana@example.test",
  recipient_name: "Ana Cruz",
  kind: "confirmation",
  subject: "Registration received: Bamboo Tee",
  body: "Hello Ana Cruz",
  status: "queued",
  scheduled_for: null,
  sent_at: null,
  provider_message_id: null,
  error: null,
  dedupe_key: "confirmation:entry-1",
  created_by: "user-1",
  created_at: "2026-10-20T08:00:00Z",
  updated_at: "2026-10-20T08:00:00Z",
  ...over,
});

const tournament = (over: Partial<Tournament> = {}): Tournament => ({
  id: TOURNAMENT_ID,
  clubId: CLUB,
  name: "Bamboo Tee",
  nameNeedsConfirmation: false,
  courseId: "course-1",
  dates: ["2026-11-12", "2026-11-13"],
  cutOffDate: CUT_OFF,
  scheduleNeedsConfirmation: false,
  courseDataConfirmed: true,
  config: { ...DEMO_CONFIG, date: "2026-11-12" },
  categories: [],
  flights: [],
  registration: {
    responseEmail: "entries@example.test",
    sponsorQuestion: "",
    payment: null,
    teeTimes: [],
    shirtSizes: [],
    fields: [],
    instructions: null,
  },
  staleIndexDays: 120,
  state: "open",
  createdAt: "2026-10-01T00:00:00Z",
  ...over,
});

const player = ({
  id,
  name,
  ...over
}: Partial<PlayerRecord> & Pick<PlayerRecord, "id" | "name">): PlayerRecord => ({
  id,
  clubId: CLUB,
  firstName: name,
  lastName: "",
  nickname: null,
  name,
  birthdate: null,
  gender: null,
  homeCourse: null,
  contactNumber: null,
  email: null,
  ngapId: null,
  createdAt: "2026-10-01T00:00:00Z",
  ...over,
});

const entry = ({
  id,
  playerId,
  ...over
}: Partial<RegistrationEntry> & Pick<RegistrationEntry, "id" | "playerId">): RegistrationEntry => ({
  id,
  clubId: CLUB,
  tournamentId: TOURNAMENT_ID,
  playerId,
  role: "member",
  sponsor: null,
  shirt: null,
  teePreferences: {},
  declaredWshId: null,
  declaredWshHandicap: null,
  extra: {},
  paymentStatus: "not_recorded",
  frozen: {
    index: null,
    recordId: null,
    effectiveDate: null,
    frozenAt: "2026-10-01T00:00:00Z",
  },
  createdAt: "2026-10-01T00:00:00Z",
  source: "desk",
  ...over,
});

function makeState(input: {
  players?: PlayerRecord[];
  entries?: RegistrationEntry[];
  tournaments?: Tournament[];
}): DeskState {
  return {
    ...emptyState(),
    clubId: CLUB,
    tournaments: input.tournaments ?? [tournament()],
    players: input.players ?? [],
    entries: input.entries ?? [],
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ` ${SITE_URL}/ `);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("email repository list", () => {
  it("maps the outbox rows and scopes the read to this club's event", async () => {
    const { client, clubScope, tournamentScope, order, limit } = fakeEmailClient({
      list: {
        data: [
          outboxRow(),
          outboxRow({
            id: "mail-2",
            registration_id: null,
            kind: "reminder",
            status: "sent",
            scheduled_for: "2026-10-21T07:00:00Z",
            sent_at: "2026-10-21T07:05:00Z",
            provider_message_id: "provider-1",
            error: "Soft bounce",
            dedupe_key: "reminder:entry-1:2026-11-01",
            created_at: "2026-10-21T06:00:00Z",
          }),
        ],
        error: null,
      },
    });
    const repository = createSupabaseEmailRepository(client, makeState({}), CLUB);

    const messages = await repository.list(TOURNAMENT_ID);

    expect(messages).toEqual([
      {
        id: "mail-1",
        tournamentId: TOURNAMENT_ID,
        registrationId: "entry-1",
        recipientEmail: "ana@example.test",
        recipientName: "Ana Cruz",
        kind: "confirmation",
        subject: "Registration received: Bamboo Tee",
        body: "Hello Ana Cruz",
        status: "queued",
        scheduledFor: null,
        sentAt: null,
        error: null,
        createdAt: "2026-10-20T08:00:00Z",
      },
      {
        id: "mail-2",
        tournamentId: TOURNAMENT_ID,
        registrationId: null,
        recipientEmail: "ana@example.test",
        recipientName: "Ana Cruz",
        kind: "reminder",
        subject: "Registration received: Bamboo Tee",
        body: "Hello Ana Cruz",
        status: "sent",
        scheduledFor: "2026-10-21T07:00:00Z",
        sentAt: "2026-10-21T07:05:00Z",
        error: "Soft bounce",
        createdAt: "2026-10-21T06:00:00Z",
      },
    ]);
    expect(clubScope).toHaveBeenCalledWith("club_id", CLUB);
    expect(tournamentScope).toHaveBeenCalledWith("tournament_id", TOURNAMENT_ID);
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(200);
  });

  it("reads an empty outbox as an empty list", async () => {
    const { client } = fakeEmailClient({ list: { data: null, error: null } });
    const repository = createSupabaseEmailRepository(client, makeState({}), CLUB);

    await expect(repository.list(TOURNAMENT_ID)).resolves.toEqual([]);
  });

  it.each([
    [
      "a missing relation",
      { code: "42P01", message: 'relation "public.email_outbox" does not exist' },
    ],
    ["an unknown schema cache entry", { message: "Could not find the table in the schema cache" }],
  ])("explains the missing migration for %s", async (_label, error) => {
    const { client } = fakeEmailClient({ list: { data: null, error } });
    const repository = createSupabaseEmailRepository(client, makeState({}), CLUB);

    await expect(repository.list(TOURNAMENT_ID)).rejects.toThrow(
      "Email reminders need migration 20261040000000. Nothing was sent.",
    );
  });

  it("keeps the database message for an error that is not a missing migration", async () => {
    const { client } = fakeEmailClient({
      list: {
        data: null,
        error: { code: "42501", message: "permission denied for table email_outbox" },
      },
    });
    const repository = createSupabaseEmailRepository(client, makeState({}), CLUB);

    await expect(repository.list(TOURNAMENT_ID)).rejects.toThrow(
      "Could not load email drafts: permission denied for table email_outbox",
    );
  });
});

describe("email repository queue", () => {
  it("queues a confirmation draft only for registered players with an email", async () => {
    const { client, upsert, selectIds } = fakeEmailClient({
      upsert: { data: [{ id: "mail-1" }], error: null },
    });
    const repository = createSupabaseEmailRepository(
      client,
      makeState({
        players: [
          player({ id: "player-1", name: "Ana Cruz", email: " ana@example.test " }),
          player({ id: "player-2", name: "Ben Reyes", email: null }),
          player({ id: "player-3", name: "Cara Lim", email: "   " }),
        ],
        entries: [
          entry({ id: "entry-1", playerId: "player-1" }),
          entry({ id: "entry-2", playerId: "player-2" }),
          entry({ id: "entry-3", playerId: "player-3" }),
          entry({ id: "entry-4", playerId: "missing-player" }),
          entry({ id: "entry-5", playerId: "player-1", tournamentId: "other-tournament" }),
        ],
      }),
      CLUB,
    );

    const result = await repository.queue(TOURNAMENT_ID, "confirmation");

    expect(result).toEqual({ queued: 1, skipped: 0 });
    expect(upsert).toHaveBeenCalledTimes(1);
    const [rows, options] = upsert.mock.calls[0] ?? [];
    expect(options).toEqual({ onConflict: "club_id,dedupe_key", ignoreDuplicates: true });
    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({
      club_id: CLUB,
      tournament_id: TOURNAMENT_ID,
      registration_id: "entry-1",
      recipient_email: "ana@example.test",
      recipient_name: "Ana Cruz",
      kind: "confirmation",
      subject: "Registration received: Bamboo Tee",
      status: "queued",
      dedupe_key: "confirmation:entry-1",
    });
    expect(rows?.[0]?.body).toContain("Hello Ana Cruz");
    expect(rows?.[0]?.body).toContain(`Event page: ${SITE_URL}`);
    // Queuing creates a draft. Delivery is the API's business, so nothing here says "sent".
    expect(rows?.[0]?.status).not.toBe("sent");
    expect(rows?.[0]).not.toHaveProperty("sent_at");
    expect(selectIds).toHaveBeenCalledWith("id");
  });

  it("queues reminder drafts with a dedupe key tied to the cut-off", async () => {
    const { client, upsert } = fakeEmailClient({
      upsert: { data: [{ id: "mail-1" }], error: null },
    });
    const repository = createSupabaseEmailRepository(
      client,
      makeState({
        players: [player({ id: "player-1", name: "Ana Cruz", email: "ana@example.test" })],
        entries: [entry({ id: "entry-1", playerId: "player-1" })],
      }),
      CLUB,
    );

    const result = await repository.queue(TOURNAMENT_ID, "reminder");

    expect(result).toEqual({ queued: 1, skipped: 0 });
    const rows = upsert.mock.calls[0]?.[0] ?? [];
    expect(rows?.[0]).toMatchObject({
      kind: "reminder",
      subject: "Reminder: Bamboo Tee",
      status: "queued",
      dedupe_key: `reminder:entry-1:${CUT_OFF}`,
    });
    expect(rows?.[0]?.body).toContain(`Cut-off: ${CUT_OFF}`);
  });

  it("counts a row the dedupe key already held as skipped, not as a delivery", async () => {
    const { client, upsert } = fakeEmailClient({
      upsert: { data: [{ id: "mail-1" }], error: null },
    });
    const repository = createSupabaseEmailRepository(
      client,
      makeState({
        players: [
          player({ id: "player-1", name: "Ana Cruz", email: "ana@example.test" }),
          player({ id: "player-2", name: "Ben Reyes", email: "ben@example.test" }),
        ],
        entries: [
          entry({ id: "entry-1", playerId: "player-1" }),
          entry({ id: "entry-2", playerId: "player-2" }),
        ],
      }),
      CLUB,
    );

    const result = await repository.queue(TOURNAMENT_ID, "confirmation");

    expect(result).toEqual({ queued: 1, skipped: 1 });
    const rows = upsert.mock.calls[0]?.[0] ?? [];
    expect(rows.map((row) => row.dedupe_key)).toEqual([
      "confirmation:entry-1",
      "confirmation:entry-2",
    ]);
    expect(rows.every((row) => row.status === "queued")).toBe(true);
  });

  it("returns a plain message without touching the outbox when no player has an email", async () => {
    const { client, from } = fakeEmailClient();
    const repository = createSupabaseEmailRepository(
      client,
      makeState({
        players: [
          player({ id: "player-1", name: "Ana Cruz", email: null }),
          player({ id: "player-2", name: "Ben Reyes", email: "  " }),
        ],
        entries: [
          entry({ id: "entry-1", playerId: "player-1" }),
          entry({ id: "entry-2", playerId: "player-2" }),
        ],
      }),
      CLUB,
    );

    await expect(repository.queue(TOURNAMENT_ID, "confirmation")).resolves.toEqual({
      queued: 0,
      skipped: 0,
      message: "No registered player has an email address.",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses an event that is not in the desk state", async () => {
    const { client, from } = fakeEmailClient();
    const repository = createSupabaseEmailRepository(client, makeState({}), CLUB);

    await expect(repository.queue("missing-tournament", "confirmation")).rejects.toThrow(
      "That event was not found.",
    );
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a missing relation",
      { code: "42P01", message: 'relation "public.email_outbox" does not exist' },
    ],
    ["an unknown schema cache entry", { message: "Could not find the table in the schema cache" }],
  ])(
    "explains the missing migration for %s before claiming anything was queued",
    async (_label, error) => {
      const { client } = fakeEmailClient({ upsert: { data: null, error } });
      const repository = createSupabaseEmailRepository(
        client,
        makeState({
          players: [player({ id: "player-1", name: "Ana Cruz", email: "ana@example.test" })],
          entries: [entry({ id: "entry-1", playerId: "player-1" })],
        }),
        CLUB,
      );

      await expect(repository.queue(TOURNAMENT_ID, "confirmation")).rejects.toThrow(
        "Email reminders need migration 20261040000000. Nothing was queued.",
      );
    },
  );

  it("keeps the database message for an error that is not a missing migration", async () => {
    const { client } = fakeEmailClient({
      upsert: {
        data: null,
        error: { code: "42501", message: "permission denied for table email_outbox" },
      },
    });
    const repository = createSupabaseEmailRepository(
      client,
      makeState({
        players: [player({ id: "player-1", name: "Ana Cruz", email: "ana@example.test" })],
        entries: [entry({ id: "entry-1", playerId: "player-1" })],
      }),
      CLUB,
    );

    await expect(repository.queue(TOURNAMENT_ID, "confirmation")).rejects.toThrow(
      "Could not queue email drafts: permission denied for table email_outbox",
    );
  });
});
