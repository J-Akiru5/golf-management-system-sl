import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireScorecardAccess } from "@/lib/scorecards/access";
import {
  getScorecardStore,
  type ScorecardStore,
  ScorecardStoreBusy,
  type StoredScorecardDocument,
} from "@/lib/scorecards/store";
import { GET, PUT } from "./route";

vi.mock("@/lib/scorecards/access", () => ({ requireScorecardAccess: vi.fn() }));
vi.mock("@/lib/scorecards/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scorecards/store")>();
  return { ...actual, getScorecardStore: vi.fn() };
});

const access = vi.mocked(requireScorecardAccess);
const getStore = vi.mocked(getScorecardStore);

function card(id: string, rev: number, hole: string) {
  return {
    id,
    name: id.toUpperCase(),
    rev,
    holes: Array.from({ length: 18 }, (_, index) => (index === 0 ? hole : "")),
  };
}

function fakeStore(overrides: Partial<ScorecardStore> = {}) {
  const get = vi.fn<ScorecardStore["get"]>().mockResolvedValue(null);
  const put = vi.fn<ScorecardStore["put"]>().mockImplementation(async (input) => ({
    slug: input.slug,
    event: input.event,
    label: input.label,
    payload: input.payload,
    updatedAt: "2026-11-15T00:00:00.000Z",
    updatedBy: input.updatedBy ?? null,
  }));
  const locked = vi.fn();
  locked.mockImplementation(
    async (_slug: string, _by: string | null, run: () => Promise<unknown>) => run(),
  );
  const store: ScorecardStore = {
    get,
    list: vi.fn<ScorecardStore["list"]>().mockResolvedValue([]),
    put,
    locked: locked as unknown as ScorecardStore["locked"],
    snapshot: vi.fn<ScorecardStore["snapshot"]>().mockResolvedValue({
      path: null,
      at: "2026-11-15T00:00:00.000Z",
    }),
    close: vi.fn(),
    ...overrides,
  };
  getStore.mockResolvedValue(store);
  return { store, get, put, locked };
}

const context = { params: Promise.resolve({ slug: "day1am-r5" }) };

function request(body: unknown): Request {
  return new Request("http://localhost/api/scorecards/day1am-r5", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function documentWith(cards: unknown[]): StoredScorecardDocument {
  return {
    slug: "day1am-r5",
    event: "24th Bamboo Tee",
    label: "Day 1 AM",
    updatedAt: "2026-11-14T00:00:00.000Z",
    updatedBy: "maria@example.com",
    payload: { cards },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  access.mockResolvedValue({
    ok: true,
    status: 200,
    message: "",
    role: "tabulation",
    email: "tabulator@example.com",
  });
});

describe("the shared scorecard route", () => {
  it("merges a save into the shared copy and records the account", async () => {
    const { get, put } = fakeStore();
    get.mockResolvedValue(documentWith([card("a", 10, "5")]));

    const response = await PUT(
      request({
        event: "24th Bamboo Tee",
        label: "Day 1 AM",
        payload: { cards: [card("b", 20, "4")] },
      }),
      context,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    const saved = put.mock.calls[0]?.[0];
    expect((saved?.payload.cards as { id: string }[]).map((entry) => entry.id).sort()).toEqual([
      "a",
      "b",
    ]);
    expect(saved?.updatedBy).toBe("tabulator@example.com");
    expect(body.updatedBy).toBe("tabulator@example.com");
  });

  it("says who saved last when the page reads the shared copy", async () => {
    const { get } = fakeStore();
    get.mockResolvedValue(documentWith([]));

    const response = await GET(new Request("http://localhost/api/scorecards/day1am-r5"), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.updatedBy).toBe("maria@example.com");
  });

  it("answers 423 while another tabulator holds the lease", async () => {
    const { locked } = fakeStore();
    locked.mockRejectedValue(new ScorecardStoreBusy("Another tabulator is saving this page."));

    const response = await PUT(request({ payload: { cards: [] } }), context);
    const body = await response.json();

    expect(response.status).toBe(423);
    expect(body.busy).toBe(true);
  });

  it("refuses an account that is not on the tabulation team", async () => {
    access.mockResolvedValue({
      ok: false,
      status: 403,
      message: "This account is not on the tabulation team.",
    });
    fakeStore();

    const response = await PUT(request({ payload: { cards: [] } }), context);
    expect(response.status).toBe(403);
  });
});
