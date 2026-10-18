import { freezeIndex, selectIndexForCutOff } from "@/lib/data/frozen";
import type {
  Club,
  Course,
  HandicapRecord,
  Hole,
  PlayerRecord,
  RegistrationEntry,
  Tournament,
} from "@/lib/data/types";
import { nameKey } from "@/lib/ngap";
import type { CategoryRule, FlightRule, Player, Tee, TournamentConfig } from "@/lib/routing";

/**
 * Deterministic demo data for the IGCC Tournament Desk shell. Every player is fictional and every
 * number that would come from an official source is labelled as a placeholder:
 *   - tee ratings are invented (the real Course Rating, Slope and Par are pending from the club);
 *   - stroke index and par per hole are null until the club scorecard arrives;
 *   - handicap records stand in for an NGAP export the project has never seen.
 * The demo is the same on every load, so screenshots and tests are stable.
 */

export const DEMO_CLUB: Club = {
  id: "igcc",
  name: "Iloilo Golf & Country Club",
  shortName: "IGCC",
  location: "Sta. Barbara, Iloilo",
};

export const DEMO_COURSE: Course = {
  id: "igcc-main",
  clubId: DEMO_CLUB.id,
  name: "IGCC Main Course",
  holes: 18,
};

/** 18 holes with par and stroke index left null: the club scorecard has not been entered. */
export const DEMO_HOLES: Hole[] = Array.from({ length: 18 }, (_, i) => ({
  id: `h${i + 1}`,
  courseId: DEMO_COURSE.id,
  number: i + 1,
  par: null,
  strokeIndex: null,
}));

/** Placeholder ratings. The real IGCC Course Rating, Slope and Par must be entered before a real event. */
export const DEMO_TEES: Tee[] = [
  { id: "white", name: "White", courseRating: 71.5, slope: 128, par: 72 },
  { id: "senior", name: "Senior", courseRating: 70.1, slope: 125, par: 72 },
  { id: "silver", name: "Silver", courseRating: 68.9, slope: 122, par: 72 },
  { id: "red", name: "Red", courseRating: 70.0, slope: 120, par: 72 },
];

export const DEMO_CATEGORIES: CategoryRule[] = [
  { id: "regular", name: "Regular", gender: "M", minAge: 0, maxAge: 59, teeId: "white" },
  { id: "senior", name: "Senior", gender: "M", minAge: 60, maxAge: 69, teeId: "senior" },
  { id: "super", name: "Super Senior", gender: "M", minAge: 70, maxAge: null, teeId: "silver" },
  { id: "ladies", name: "Ladies", gender: "F", minAge: 0, maxAge: null, teeId: "red" },
];

export const DEMO_FLIGHTS: FlightRule[] = [
  { id: "r-a", categoryId: "regular", name: "Regular A", min: -10, max: 12 },
  { id: "r-b", categoryId: "regular", name: "Regular B", min: 12.1, max: 20 },
  { id: "r-c", categoryId: "regular", name: "Regular C", min: 20.1, max: 30 },
  { id: "s-a", categoryId: "senior", name: "Senior A", min: -10, max: 18 },
  { id: "s-b", categoryId: "senior", name: "Senior B", min: 18.1, max: 30 },
  { id: "ss-a", categoryId: "super", name: "Super Senior", min: -10, max: 30 },
  { id: "l-a", categoryId: "ladies", name: "Ladies A", min: -10, max: 18 },
  { id: "l-b", categoryId: "ladies", name: "Ladies B", min: 18.1, max: 30 },
];

/**
 * Engine settings for the legacy demo event. Rules are settings, never constants.
 * The date stays at the old demo value because the parked Supabase store and its test read this
 * object directly; the shell's Bamboo Tee event overrides the date to its own first day below.
 */
export const DEMO_CONFIG: TournamentConfig = {
  date: "2026-11-14",
  maxIndex: 30,
  allowance: 1,
  flightBasis: "index",
  startFormat: "shotgun",
  holes: 18,
  groupSize: 4,
  minGroupSize: 3,
  firstTeeTime: "06:30",
  intervalMinutes: 12,
  waveGapMinutes: 300,
};

export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

const SEED_NOW = "2026-10-20T09:00:00+08:00";

/** Two demo events: the multi-day Bamboo Tee sample and an empty monthly medal for empty states. */
export function makeDemoTournaments(): Tournament[] {
  const bambooTee: Tournament = {
    id: "bamboo-tee-2026",
    clubId: DEMO_CLUB.id,
    name: "Bamboo Tee (demo sample title)",
    // The materials in this repo do not name the November event, so the title is editable and flagged.
    nameNeedsConfirmation: true,
    courseId: DEMO_COURSE.id,
    dates: ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"],
    cutOffDate: "2026-11-01",
    scheduleNeedsConfirmation: true,
    // Age and the cut-off read the first day of the event; the legacy DEMO_CONFIG date is not used.
    config: { ...DEMO_CONFIG, date: "2026-11-12" },
    categories: DEMO_CATEGORIES,
    flights: DEMO_FLIGHTS,
    registration: {
      responseEmail: "entries@example.com",
      sponsorQuestion: "Are you a sponsor?",
      payment: {
        method: "Bank transfer",
        bank: "Sample Bank",
        accountName: "Demo Golf Club",
        accountNumber: "0000 0000 0000",
        note: "Payment is recorded by hand at the desk. This demo does not take, check or confirm payments.",
      },
      teeTimes: [
        {
          day: 1,
          label: "Day 1",
          date: "2026-11-12",
          options: ["6:30 AM", "12:30 PM"],
          needsConfirmation: false,
        },
        {
          day: 2,
          label: "Day 2",
          date: "2026-11-13",
          options: ["6:30 AM", "12:30 PM"],
          needsConfirmation: false,
        },
        {
          day: 3,
          label: "Day 3",
          date: "2026-11-14",
          options: ["6:30 AM", "12:30 PM"],
          needsConfirmation: false,
        },
        {
          day: 4,
          label: "Day 4 (as supplied)",
          date: "2026-11-15",
          options: ["6:30 AM", "11:30PM Tee Off"],
          needsConfirmation: true,
        },
      ],
      shirtSizes: SHIRT_SIZES,
      fields: [
        {
          id: "caddie",
          label: "Caddie request",
          type: "select",
          options: ["No preference", "Club caddie", "Own caddie"],
          required: false,
          appliesTo: "both",
          help: "A sample extra field. Rename or remove it in Setup.",
          sample: true,
        },
      ],
      instructions:
        "Tee-time choices are preferences until the draw is published. Registration is recorded by the desk from saved profiles.",
    },
    staleIndexDays: 60,
    state: "open",
    createdAt: SEED_NOW,
  };

  const monthlyMedal: Tournament = {
    id: "monthly-medal-sample",
    clubId: DEMO_CLUB.id,
    name: "IGCC Monthly Medal (sample)",
    nameNeedsConfirmation: false,
    courseId: DEMO_COURSE.id,
    dates: ["2026-10-24"],
    cutOffDate: "2026-10-17",
    scheduleNeedsConfirmation: false,
    config: {
      ...DEMO_CONFIG,
      date: "2026-10-24",
      startFormat: "two_tee",
      firstTeeTime: "07:00",
    },
    categories: DEMO_CATEGORIES,
    flights: DEMO_FLIGHTS,
    registration: {
      responseEmail: "",
      sponsorQuestion: "Are you a sponsor?",
      payment: null,
      teeTimes: [
        {
          day: 1,
          label: "Day 1",
          date: "2026-10-24",
          options: ["7:00 AM", "12:00 PM"],
          needsConfirmation: false,
        },
      ],
      shirtSizes: SHIRT_SIZES,
      fields: [],
      instructions: "Sample event with no entries, to show the empty states.",
    },
    staleIndexDays: 60,
    state: "open",
    createdAt: SEED_NOW,
  };

  return [bambooTee, monthlyMedal];
}

// Small seeded generator so the demo is the same on every load.
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MALE = [
  "Antonio",
  "Benjamin",
  "Carlos",
  "Domingo",
  "Eduardo",
  "Felix",
  "Gregorio",
  "Henry",
  "Ignacio",
  "Jaime",
  "Kenneth",
  "Leandro",
  "Manuel",
  "Noel",
  "Oscar",
  "Ramon",
  "Rodrigo",
  "Sergio",
  "Tomas",
  "Victor",
];
const FEMALE = [
  "Adela",
  "Bernadette",
  "Carmela",
  "Dolores",
  "Elena",
  "Fe",
  "Gloria",
  "Helen",
  "Imelda",
  "Josefina",
  "Katrina",
  "Lourdes",
];
const LAST = [
  "Alcantara",
  "Bautista",
  "Castillo",
  "Dizon",
  "Espinosa",
  "Fernandez",
  "Garcia",
  "Hernandez",
  "Ledesma",
  "Mercado",
  "Navarro",
  "Ocampo",
  "Padilla",
  "Quijano",
  "Ramos",
  "Salazar",
  "Tan",
  "Uy",
  "Villanueva",
  "Yulo",
];
const NICKNAMES = ["Boy", "Nonoy", "Jing", "Bebot", "Tito", "Dodong", "Nene", "Boyet"];
const AWAY_COURSES = [
  "Highland Greens GC (sample)",
  "Coastal Links GC (sample)",
  "Riverside Golf Club (sample)",
];

export interface DemoSeed {
  players: PlayerRecord[];
  records: HandicapRecord[];
  entries: RegistrationEntry[];
}

/** One revision of a player's index in the seed. `index: null` means the file said NH. */
export interface SeedHistory {
  index: number | null;
  effectiveDate: string;
}

const iso = (d: number, m: number, y: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Builds the demo directory, handicap history and Bamboo Tee entries. Edge cases are deliberate:
 * an over-limit index, an NH record, a record that only exists after the cut-off, a stale record,
 * two players with the same name, and an incomplete stub from a deferred import decision.
 */
export function makeDemoSeed(cutOffDate = "2026-11-01"): DemoSeed {
  const r = rng(2026);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)] as T;
  const players: PlayerRecord[] = [];
  const records: HandicapRecord[] = [];
  // Names that must stay unique in the directory, so the directory and the sample file line up.
  const usedNames = new Set(
    [
      // The three names the sample NGAP file links by ID.
      "Antonio Alcantara",
      "Benjamin Bautista",
      "Carlos Castillo",
      // Reserved for the deliberate edge cases and guests added below with fixed names.
      "Felipe Marquez",
      "Rogelio Sarmiento",
      "Marissa Cordero",
      "Alfredo Zamora",
      "Pedro Villanueva",
      "Ramon Aguilar",
      "Noel Yulo",
      "Gregorio Padilla",
      "Aurelio Tamayo",
      // Reserved so the generator does not make a third one; the two added below are deliberate.
      "Juan Dela Cruz",
    ].map(nameKey),
  );
  /** Generated names keep out of the reserved list, so the directory has no accidental twins. */
  const uniqueGeneratedName = (gender: "M" | "F"): string => {
    const pool = gender === "M" ? MALE : FEMALE;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = `${pick(pool)} ${pick(LAST)}`;
      if (!usedNames.has(nameKey(candidate))) {
        usedNames.add(nameKey(candidate));
        return candidate;
      }
    }
    const fallback = `${pick(pool)} ${String.fromCharCode(65 + (players.length % 26))}. ${pick(LAST)}`;
    usedNames.add(nameKey(fallback));
    return fallback;
  };

  const addRecord = (
    playerId: string,
    index: number | null,
    effectiveDate: string,
    source: HandicapRecord["source"] = "demo_seed",
  ) => {
    records.push({
      id: `rec-${records.length + 1}`,
      clubId: DEMO_CLUB.id,
      playerId,
      index,
      effectiveDate,
      source,
      uploadRef: source === "demo_seed" ? null : "sample-ngap.csv",
      recordedAt: SEED_NOW,
    });
  };

  const addPlayer = (
    full: string,
    gender: "M" | "F",
    age: number,
    homeCourse: string,
    opts: { history?: SeedHistory[]; nickname?: string; stub?: boolean; ngapId?: string } = {},
  ): PlayerRecord => {
    const n = players.length + 1;
    const [first = "Player", ...rest] = full.split(" ");
    const last = rest.join(" ") || `Sample${n}`;
    const id = `p${n}`;
    const year = 2026 - age;
    const month = 1 + Math.floor(r() * 12);
    const day = 1 + Math.floor(r() * 27);
    const player: PlayerRecord = {
      id,
      clubId: DEMO_CLUB.id,
      firstName: first,
      lastName: last,
      nickname: opts.nickname ?? null,
      name: full,
      birthdate: opts.stub ? null : iso(day, month, year),
      gender: opts.stub ? null : gender,
      homeCourse,
      contactNumber: opts.stub
        ? null
        : `+63 9${String(10 + Math.floor(r() * 80)).padStart(2, "0")} ${String(
            100 + Math.floor(r() * 800),
          )} ${String(1000 + Math.floor(r() * 8000))}`,
      email:
        r() < 0.3 && !opts.stub ? `${last.toLowerCase()}.${first.toLowerCase()}@example.com` : null,
      ngapId: opts.ngapId ?? (opts.stub ? "3002" : String(1000 + n)),
      createdAt: SEED_NOW,
    };
    if (!player.nickname && !opts.stub && r() < 0.4) player.nickname = pick(NICKNAMES);
    players.push(player);

    if (opts.stub) return player;
    if (opts.history) {
      for (const h of opts.history) addRecord(id, h.index, h.effectiveDate);
      return player;
    }
    const index = Math.round((2 + r() * 27) * 10) / 10;
    if (r() < 0.75) addRecord(id, Math.round((index + (r() - 0.5) * 3) * 10) / 10, "2026-09-15");
    addRecord(id, index, "2026-10-15");
    return player;
  };

  const home = DEMO_CLUB.name;

  // Regular men.
  for (let i = 0; i < 40; i++)
    addPlayer(uniqueGeneratedName("M"), "M", 24 + Math.floor(r() * 36), home);
  // Senior men (60-69).
  for (let i = 0; i < 20; i++)
    addPlayer(uniqueGeneratedName("M"), "M", 60 + Math.floor(r() * 10), home);
  // Super seniors (70+).
  for (let i = 0; i < 8; i++)
    addPlayer(uniqueGeneratedName("M"), "M", 70 + Math.floor(r() * 13), home);
  // Ladies.
  for (let i = 0; i < 12; i++)
    addPlayer(uniqueGeneratedName("F"), "F", 28 + Math.floor(r() * 39), home);

  // The first three match the sample NGAP file so the import demo reads cleanly.
  for (const [i, expected] of (
    ["Antonio Alcantara", "Benjamin Bautista", "Carlos Castillo"] as const
  ).entries()) {
    const p = players[i];
    if (p) {
      p.name = expected;
      p.ngapId = String(1001 + i);
    }
  }

  // Guests: away players entered by a member.
  const guests = [
    addPlayer("Felipe Marquez", "M", 52, AWAY_COURSES[0] as string),
    addPlayer("Rogelio Sarmiento", "M", 63, AWAY_COURSES[1] as string),
    addPlayer("Marissa Cordero", "F", 45, AWAY_COURSES[2] as string),
    addPlayer("Alfredo Zamora", "M", 71, AWAY_COURSES[0] as string),
  ];

  // Deliberate edge cases.
  addPlayer("Pedro Villanueva", "M", 46, home, {
    ngapId: "1991",
    history: [{ index: 31.4, effectiveDate: "2026-10-15" }],
  });
  addPlayer("Ramon Aguilar", "M", 51, home, {
    ngapId: "1992",
    history: [{ index: null, effectiveDate: "2026-10-15" }],
  });
  addPlayer("Juan Dela Cruz", "M", 38, home, { ngapId: "7001" });
  addPlayer("Juan Dela Cruz", "M", 57, home, { ngapId: "7002" });
  addPlayer("Noel Yulo", "M", 44, home, {
    history: [{ index: 12.6, effectiveDate: "2026-11-05" }],
  });
  addPlayer("Gregorio Padilla", "M", 66, home, {
    history: [{ index: 21.5, effectiveDate: "2026-02-10" }],
  });
  // The stub a deferred import decision can leave behind.
  addPlayer("Aurelio Tamayo", "M", 60, home, { stub: true, nickname: "Aurelio" });

  const entries: RegistrationEntry[] = [];
  const frozenAt = "2026-10-20T09:00:00+08:00";
  const recordOf = (playerId: string) => records.filter((x) => x.playerId === playerId);
  const guestIds = new Set(guests.map((g) => g.id));

  for (const p of players) {
    if (p.birthdate === null || p.gender === null) continue; // the stub has no entry yet
    const selection = selectIndexForCutOff(recordOf(p.id), cutOffDate);
    entries.push({
      id: `e-${entries.length + 1}`,
      clubId: DEMO_CLUB.id,
      tournamentId: "bamboo-tee-2026",
      playerId: p.id,
      role: guestIds.has(p.id) ? "guest" : "member",
      sponsor: r() < 0.12,
      shirt: pick(SHIRT_SIZES),
      teePreferences: {
        "2026-11-12": r() < 0.6 ? "6:30 AM" : "12:30 PM",
        "2026-11-13": r() < 0.5 ? null : "6:30 AM",
      },
      declaredWshId: p.ngapId,
      declaredWshHandicap: null,
      extra: {},
      paymentStatus: r() < 0.45 ? "pending" : r() < 0.5 ? "recorded_paid" : "not_recorded",
      frozen: freezeIndex(selection, frozenAt),
      createdAt: frozenAt,
      source: "demo_seed",
    });
  }

  return { players, records, entries };
}

export const SAMPLE_NGAP_CSV = `Player Name,NGAP No.,Handicap Index,Revision Date
"ALCANTARA, Antonio",1001,12.4,11/01/2026
Benjamin Bautista,1002,+1.2,11/01/2026
Carlos Castillo,1003,18.9,11/01/2026
Pedro Villanueva,1991,29.8,11/01/2026
Ramon Aguilar,1992,NH,11/01/2026
Juan Newgolfer,3001,22.0,11/01/2026
"DELA CRUZ, Juan",7009,18.2,11/01/2026
Antonio Alcantara,8888,5.0,11/01/2026
Carlos Castillo,1003,17.6,11/15/2026
Maria Unknown,,15.5,13/13/2026
`;

/* ------------------------------------------------------------------------------------------------
 * Legacy seed, kept for the parked Supabase store and its test.
 *
 * The Supabase data layer (src/lib/data/supabase, src/lib/store/legacy-supabase-store.tsx) still
 * reads the old DeskPlayer shape and this old 68-player demo. It stays here, untouched, so nothing
 * of that work is lost while the data layer is wired to the shell. Do not build new features on
 * these exports; the shell uses PlayerRecord and makeDemoSeed above.
 * ---------------------------------------------------------------------------------------------- */

/** The old desk player: one index per player, before handicap records and registrations split. */
export interface DeskPlayer extends Player {
  ngapId: string | null;
  photo?: string;
  /** Set only when the player agreed to the photo being kept and used. */
  photoConsent?: boolean;
  shirt?: string;
}

/** The old 68-player demo set kept for the parked Supabase store and its test. */
export function makeDemoPlayers(): DeskPlayer[] {
  const r = rng(2026);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)] as T;
  const out: DeskPlayer[] = [];
  const add = (gender: "M" | "F", minAge: number, maxAge: number) => {
    const n = out.length + 1;
    const age = minAge + Math.floor(r() * (maxAge - minAge + 1));
    const year = 2026 - age;
    const month = 1 + Math.floor(r() * 12);
    const day = 1 + Math.floor(r() * 27);
    out.push({
      id: `p${n}`,
      name: `${pick(gender === "M" ? MALE : FEMALE)} ${pick(LAST)}`,
      birthdate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      gender,
      index: Math.round((2 + r() * 27) * 10) / 10,
      ngapId: String(1000 + n),
    });
  };
  for (let i = 0; i < 34; i++) add("M", 24, 59);
  for (let i = 0; i < 16; i++) add("M", 60, 69);
  for (let i = 0; i < 6; i++) add("M", 70, 82);
  for (let i = 0; i < 10; i++) add("F", 28, 66);
  // The first three match the sample NGAP file so the import demo reads cleanly.
  for (const [i, n] of (
    ["Antonio Alcantara", "Benjamin Bautista", "Carlos Castillo"] as const
  ).entries()) {
    const p = out[i];
    if (p) p.name = n;
  }
  // Edge cases the organizer will meet: over the limit, no handicap, no category fit.
  out.push({
    id: "p-over",
    name: "Pedro Villanueva",
    birthdate: "1980-05-02",
    gender: "M",
    index: 31.4,
    ngapId: "1991",
  });
  out.push({
    id: "p-nh",
    name: "Ramon Aguilar",
    birthdate: "1975-09-18",
    gender: "M",
    index: null,
    ngapId: "1992",
  });
  return out;
}
