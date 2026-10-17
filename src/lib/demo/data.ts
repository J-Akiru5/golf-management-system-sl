import type { CategoryRule, FlightRule, Player, Tee, TournamentConfig } from "@/lib/routing";

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

export const DEMO_CONFIG: TournamentConfig = {
  date: "2026-11-14",
  maxIndex: 30,
  allowance: 1,
  flightBasis: "index",
  startFormat: "shotgun",
  holes: 18,
  groupSize: 4,
  minGroupSize: 3,
  firstTeeTime: "07:00",
  intervalMinutes: 12,
  waveGapMinutes: 300,
};

export interface DeskPlayer extends Player {
  ngapId: string | null;
  photo?: string;
  shirt?: string;
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

export const SAMPLE_NGAP_CSV = `Player Name,NGAP No.,Handicap Index,Revision Date
"ALCANTARA, Antonio",1001,12.4,11/01/2026
Benjamin Bautista,1002,+1.2,11/01/2026
Carlos Castillo,1003,18.9,11/01/2026
Pedro Villanueva,1991,29.8,11/01/2026
Ramon Aguilar,1992,NH,11/01/2026
Juan Newgolfer,3001,22.0,11/01/2026
Maria Unknown,,15.5,13/13/2026
`;
