import type { SupabaseClient } from "@supabase/supabase-js";
import { POSITION_STEP } from "@/lib/db/constants";
import type {
  Database,
  PipelineStage,
  WorkspaceMemberRow,
  WsPipelineCardRow,
} from "@/lib/db/types";

/**
 * Pipeline board repository.
 *
 * One interface, two implementations. The Supabase one runs as the signed-in member, so row level
 * security is the real protection. The demo one is in-memory and is only reachable while
 * `demoMode()` is true (development build, OPS_DEMO=1, no Supabase URL).
 */

export type BoardCard = WsPipelineCardRow;

export type BoardMember = Pick<WorkspaceMemberRow, "user_id" | "display_name">;

export type BoardTournament = {
  id: string;
  name: string;
  play_date: string | null;
};

/** A card update. The creator, the id and the timestamps are never writable from the app. */
export type CardPatch = Partial<
  Pick<
    WsPipelineCardRow,
    | "tournament_id"
    | "title"
    | "club_name"
    | "stage"
    | "position"
    | "start_date"
    | "end_date"
    | "expected_players"
    | "pricing_model"
    | "quoted_amount"
    | "currency"
    | "owner_id"
    | "notes"
  >
>;

export type NewCardInput = {
  title: string;
  clubName: string;
  stage?: PipelineStage;
};

/**
 * `ownerId`: omitted means every owner, null means unassigned, a string means that member.
 * `month`: omitted means every month, null means no start date, "YYYY-MM" means that month.
 */
export type ListCardsFilter = {
  ownerId?: string | null;
  month?: string | null;
};

export interface BoardRepo {
  listCards(filter?: ListCardsFilter): Promise<BoardCard[]>;
  getCard(id: string): Promise<BoardCard | null>;
  /** Quick create: the card is placed at the end of its column. */
  createCard(input: NewCardInput): Promise<BoardCard>;
  updateCard(id: string, patch: CardPatch): Promise<BoardCard>;
  moveCard(input: { id: string; stage: PipelineStage; position: number }): Promise<BoardCard>;
  deleteCard(id: string): Promise<void>;
  /** For the owner filter and the owner picker. */
  listMembers(): Promise<BoardMember[]>;
  /** May be empty when the viewer is a workspace member with no club membership. */
  listTournaments(): Promise<BoardTournament[]>;
}

// -------------------------------------------------------------------------------------------------
// Supabase
// -------------------------------------------------------------------------------------------------

/**
 * `public.tournaments` belongs to the live tournament app and is deliberately not in the workspace
 * `Database` type. The board only reads these three columns, so the narrow view below is enough and
 * keeps the cast in one named place.
 */
type TournamentColumns = {
  public: {
    Tables: {
      tournaments: {
        Row: BoardTournament;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

function fail(action: string, error: { message: string }): never {
  throw new Error(`Could not ${action}: ${error.message}`);
}

/** The id of the signed-in member. The database also fills `created_by`, and RLS checks it. */
async function currentUserId(client: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error !== null) throw new Error(`Could not read your session: ${error.message}`);
  if (data.user === null) throw new Error("Sign in again before adding a card.");
  return data.user.id;
}

function nextMonthStart(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
    throw new Error(`Month "${month}" is not in the form YYYY-MM.`);
  }
  const date = new Date(Date.UTC(year, monthNumber, 1));
  return date.toISOString().slice(0, 10);
}

export function createSupabaseBoardRepo(client: SupabaseClient<Database>): BoardRepo {
  return {
    async listCards(filter = {}) {
      let query = client.from("ws_pipeline_cards").select("*");

      if (filter.ownerId === null) query = query.is("owner_id", null);
      else if (typeof filter.ownerId === "string") query = query.eq("owner_id", filter.ownerId);

      if (filter.month === null) query = query.is("start_date", null);
      else if (typeof filter.month === "string") {
        query = query
          .gte("start_date", `${filter.month}-01`)
          .lt("start_date", nextMonthStart(filter.month));
      }

      const { data, error } = await query.order("stage").order("position");
      if (error !== null) fail("load the pipeline", error);
      return data ?? [];
    },

    async getCard(id) {
      const { data, error } = await client
        .from("ws_pipeline_cards")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error !== null) fail("load the card", error);
      return data ?? null;
    },

    async createCard(input) {
      const title = input.title.trim();
      const clubName = input.clubName.trim();
      if (title === "") throw new Error("Enter a title.");
      if (clubName === "") throw new Error("Enter the club.");

      const stage = input.stage ?? "inquiry";
      const owner = await currentUserId(client);

      const { data: last, error: lastError } = await client
        .from("ws_pipeline_cards")
        .select("position")
        .eq("stage", stage)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastError !== null) fail("find the end of the column", lastError);

      const { data, error } = await client
        .from("ws_pipeline_cards")
        .insert({
          title,
          club_name: clubName,
          stage,
          position: (last?.position ?? 0) + POSITION_STEP,
          created_by: owner,
        })
        .select("*")
        .single();
      if (error !== null) fail("add the card", error);
      return data;
    },

    async updateCard(id, patch) {
      const { data, error } = await client
        .from("ws_pipeline_cards")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error !== null) fail("save the card", error);
      return data;
    },

    async moveCard({ id, stage, position }) {
      const { data, error } = await client
        .from("ws_pipeline_cards")
        .update({ stage, position })
        .eq("id", id)
        .select("*")
        .single();
      if (error !== null) fail("move the card", error);
      return data;
    },

    async deleteCard(id) {
      const { error } = await client.from("ws_pipeline_cards").delete().eq("id", id);
      if (error !== null) fail("delete the card", error);
    },

    async listMembers() {
      const { data, error } = await client
        .from("workspace_members")
        .select("user_id, display_name")
        .order("display_name");
      if (error !== null) fail("load the members", error);
      return data ?? [];
    },

    async listTournaments() {
      const tournaments = client as unknown as SupabaseClient<TournamentColumns>;
      const { data, error } = await tournaments
        .from("tournaments")
        .select("id, name, play_date")
        .order("play_date", { ascending: false, nullsFirst: false });
      if (error !== null) fail("load the tournaments", error);
      return data ?? [];
    },
  };
}

// -------------------------------------------------------------------------------------------------
// Demo
// -------------------------------------------------------------------------------------------------

const DEMO_MEMBERS: BoardMember[] = [
  { user_id: "demo-user", display_name: "Demo user" },
  { user_id: "demo-mara", display_name: "Mara Santos" },
  { user_id: "demo-joel", display_name: "Joel Reyes" },
  { user_id: "demo-anna", display_name: "Anna Lim" },
];

function seedCards(): BoardCard[] {
  const seen = { created_at: "2026-11-18T09:15:00.000Z", updated_at: "2026-11-18T09:15:00.000Z" };
  return [
    {
      ...seen,
      id: "demo-card-01",
      tournament_id: null,
      title: "Cebu Country Club invitational",
      club_name: "Cebu Country Club",
      stage: "inquiry",
      position: 1000,
      start_date: null,
      end_date: null,
      expected_players: 96,
      pricing_model: "per_player",
      quoted_amount: null,
      currency: "PHP",
      owner_id: "demo-mara",
      notes: "Asked about a two-day event in the second quarter. Waiting for their dates.",
      created_by: "demo-mara",
    },
    {
      ...seen,
      id: "demo-card-02",
      tournament_id: null,
      title: "Negros corporate golf day",
      club_name: "Negros Golf and Country Club",
      stage: "inquiry",
      position: 2000,
      start_date: "2027-02-20",
      end_date: null,
      expected_players: 72,
      pricing_model: null,
      quoted_amount: null,
      currency: "PHP",
      owner_id: null,
      notes: null,
      created_by: "demo-user",
    },
    {
      ...seen,
      id: "demo-card-03",
      tournament_id: null,
      title: "Manila Golf annual league",
      club_name: "Manila Golf and Country Club",
      stage: "proposal_sent",
      position: 1000,
      start_date: "2027-01-16",
      end_date: "2027-01-17",
      expected_players: 120,
      pricing_model: "annual",
      quoted_amount: 850000,
      currency: "PHP",
      owner_id: "demo-joel",
      notes: "Proposal sent 14 Nov. Board meets on 28 Nov.",
      created_by: "demo-joel",
    },
    {
      ...seen,
      id: "demo-card-04",
      tournament_id: null,
      title: "Tagaytay Highlands weekend series",
      club_name: "Tagaytay Highlands",
      stage: "proposal_sent",
      position: 2000,
      start_date: "2027-03-06",
      end_date: "2027-03-07",
      expected_players: 64,
      pricing_model: "per_player",
      quoted_amount: 320000,
      currency: "PHP",
      owner_id: "demo-anna",
      notes: null,
      created_by: "demo-anna",
    },
    {
      ...seen,
      id: "demo-card-05",
      tournament_id: null,
      title: "Sta. Barbara club championship",
      club_name: "Sta. Barbara Golf Club",
      stage: "confirmed",
      position: 1000,
      start_date: "2026-12-05",
      end_date: null,
      expected_players: 144,
      pricing_model: "per_player",
      quoted_amount: 640000,
      currency: "PHP",
      owner_id: "demo-mara",
      notes: "Deposit received.",
      created_by: "demo-mara",
    },
    {
      ...seen,
      id: "demo-card-06",
      tournament_id: null,
      title: "ZenLabs client golf day",
      club_name: "Iloilo Golf and Country Club",
      stage: "confirmed",
      position: 2000,
      start_date: "2026-12-18",
      end_date: null,
      expected_players: 48,
      pricing_model: "promo_discount",
      quoted_amount: 240000,
      currency: "PHP",
      owner_id: "demo-user",
      notes: null,
      created_by: "demo-user",
    },
    {
      ...seen,
      id: "demo-card-07",
      tournament_id: null,
      title: "24th Bamboo Tee",
      club_name: "Iloilo Golf and Country Club",
      stage: "prep",
      position: 1000,
      start_date: "2026-12-12",
      end_date: "2026-12-13",
      expected_players: 144,
      pricing_model: "per_player",
      quoted_amount: 1250000,
      currency: "PHP",
      owner_id: "demo-user",
      notes: "Field sheet is the authority for this one. Pairings close on 10 Dec.",
      created_by: "demo-user",
    },
    {
      ...seen,
      id: "demo-card-08",
      tournament_id: null,
      title: "MDM year-end scramble",
      club_name: "Iloilo Golf and Country Club",
      stage: "prep",
      position: 2000,
      start_date: "2026-12-20",
      end_date: null,
      expected_players: 96,
      pricing_model: "per_player",
      quoted_amount: 480000,
      currency: "PHP",
      owner_id: "demo-joel",
      notes: null,
      created_by: "demo-joel",
    },
    {
      ...seen,
      id: "demo-card-09",
      tournament_id: null,
      title: "Partner invitational",
      club_name: "Iloilo Golf and Country Club",
      stage: "live",
      position: 1000,
      start_date: "2026-11-20",
      end_date: "2026-11-21",
      expected_players: 120,
      pricing_model: "per_player",
      quoted_amount: 720000,
      currency: "PHP",
      owner_id: "demo-mara",
      notes: "Day one is under way. Scoring desk has the cards.",
      created_by: "demo-mara",
    },
    {
      ...seen,
      id: "demo-card-10",
      tournament_id: null,
      title: "Bamboo Tee sponsors' day",
      club_name: "Iloilo Golf and Country Club",
      stage: "wrap_up",
      position: 1000,
      start_date: "2026-11-08",
      end_date: null,
      expected_players: 80,
      pricing_model: "promo_discount",
      quoted_amount: 300000,
      currency: "PHP",
      owner_id: "demo-anna",
      notes: null,
      created_by: "demo-anna",
    },
    {
      ...seen,
      id: "demo-card-11",
      tournament_id: null,
      title: "2026 summer series",
      club_name: "Iloilo Golf and Country Club",
      stage: "invoiced_closed",
      position: 1000,
      start_date: "2026-06-14",
      end_date: null,
      expected_players: 100,
      pricing_model: "annual",
      quoted_amount: 900000,
      currency: "PHP",
      owner_id: "demo-user",
      notes: "Invoice paid 30 Jun.",
      created_by: "demo-user",
    },
    {
      ...seen,
      id: "demo-card-12",
      tournament_id: null,
      title: "Cebu junior open",
      club_name: "Cebu Country Club",
      stage: "invoiced_closed",
      position: 2000,
      start_date: "2026-05-10",
      end_date: null,
      expected_players: 60,
      pricing_model: "per_player",
      quoted_amount: 210000,
      currency: "PHP",
      owner_id: "demo-joel",
      notes: null,
      created_by: "demo-joel",
    },
  ];
}

/**
 * Demo writes must survive between requests, because each server action builds its repository
 * again. One module-level store does that, and only in demo mode. Tests call
 * `resetDemoBoardRepo()` so they do not depend on each other.
 */
let demoCards: BoardCard[] | null = null;

function store(): BoardCard[] {
  demoCards ??= seedCards();
  return demoCards;
}

export function resetDemoBoardRepo(): void {
  demoCards = null;
}

function copy(card: BoardCard): BoardCard {
  return { ...card };
}

function matchFilter(card: BoardCard, filter: ListCardsFilter): boolean {
  if (filter.ownerId === null) {
    if (card.owner_id !== null) return false;
  } else if (typeof filter.ownerId === "string" && card.owner_id !== filter.ownerId) {
    return false;
  }

  if (filter.month === null) {
    if (card.start_date !== null) return false;
  } else if (typeof filter.month === "string") {
    if (card.start_date === null || card.start_date.slice(0, 7) !== filter.month) return false;
  }

  return true;
}

let demoRepo: BoardRepo | null = null;

export function createDemoBoardRepo(): BoardRepo {
  // One shared instance, because the demo data is one shared store. It also keeps `createDemoRepos()`
  // equal to itself, which the foundation test checks.
  demoRepo ??= buildDemoBoardRepo();
  return demoRepo;
}

function buildDemoBoardRepo(): BoardRepo {
  function update(id: string, patch: CardPatch): BoardCard {
    const index = store().findIndex((card) => card.id === id);
    const current = store()[index];
    if (current === undefined) throw new Error("That card is no longer on the board.");
    const updated: BoardCard = { ...current, ...patch, updated_at: new Date().toISOString() };
    store()[index] = updated;
    return copy(updated);
  }

  return {
    async listCards(filter = {}) {
      return store()
        .filter((card) => matchFilter(card, filter))
        .map(copy)
        .sort((a, b) => {
          if (a.stage !== b.stage) return a.stage < b.stage ? -1 : 1;
          return a.position - b.position;
        });
    },

    async getCard(id) {
      const found = store().find((card) => card.id === id);
      return found === undefined ? null : copy(found);
    },

    async createCard(input) {
      const title = input.title.trim();
      const clubName = input.clubName.trim();
      if (title === "") throw new Error("Enter a title.");
      if (title.length > 160) throw new Error("Keep the title under 160 characters.");
      if (clubName === "") throw new Error("Enter the club.");
      if (clubName.length > 160) throw new Error("Keep the club under 160 characters.");

      const stage = input.stage ?? "inquiry";
      const end = store()
        .filter((card) => card.stage === stage)
        .reduce((highest, card) => Math.max(highest, card.position), 0);
      const now = new Date().toISOString();
      const card: BoardCard = {
        id: `demo-card-${crypto.randomUUID()}`,
        tournament_id: null,
        title,
        club_name: clubName,
        stage,
        position: end + POSITION_STEP,
        start_date: null,
        end_date: null,
        expected_players: null,
        pricing_model: null,
        quoted_amount: null,
        currency: "PHP",
        owner_id: null,
        notes: null,
        created_by: "demo-user",
        created_at: now,
        updated_at: now,
      };
      store().push(card);
      return copy(card);
    },

    async updateCard(id, patch) {
      return update(id, patch);
    },

    async moveCard({ id, stage, position }) {
      return update(id, { stage, position });
    },

    async deleteCard(id) {
      const index = store().findIndex((card) => card.id === id);
      if (index < 0) throw new Error("That card is no longer on the board.");
      store().splice(index, 1);
    },

    async listMembers() {
      return DEMO_MEMBERS.map((member) => ({ ...member }));
    },

    async listTournaments() {
      return [
        { id: "demo-tournament-1", name: "24th Bamboo Tee", play_date: "2026-12-12" },
        { id: "demo-tournament-2", name: "Partner invitational", play_date: "2026-11-20" },
      ];
    },
  };
}
