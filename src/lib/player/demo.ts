import { addIsoDays } from "@/lib/data/dates";
import type { PublicPairings, PublicProgramme } from "@/lib/data/types";
import { manilaToday } from "./dashboard";
import { SAMPLE_INDEX, SAMPLE_PLAYER, SAMPLE_PLAYING_HANDICAP } from "./demo-identity";
import type { PortalEntry, PortalScorecard, PortalState } from "./portal";
import type { LiveBoardPayload, LiveBoardRow } from "./ranks";

/**
 * Sample data for the demo build (no Supabase environment).
 *
 * The demo has no accounts, so the real portal has nothing to read and every player screen would
 * be a notice. This fixture gives the owner something to hold on a phone: one signed-in sample
 * player, one published start on today's Manilan date, a group around them and a published card.
 * It is labelled as sample data wherever it is used, and it is never imported on a connected build.
 * Every name here is already a fictional name from the demo seed.
 */

const SAMPLE_GROUP = ["Benjamin Bautista", "Carlos Castillo", "Felipe Marquez"] as const;

/** The Manila clock as HH:MM, from a real instant. */
function manilaClock(now: Date): string {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return text === "24:00" ? "00:00" : text;
}

/**
 * A tee time about 90 minutes from now, rounded to five minutes, kept inside a plausible golf day.
 * The countdown then has something real to count, which is what the demo is for.
 */
export function demoTeeTime(now: Date = new Date()): string {
  const [hourText, minuteText] = manilaClock(now).split(":");
  const minutes = Number(hourText ?? 0) * 60 + Number(minuteText ?? 0) + 90;
  const rounded = Math.round(minutes / 5) * 5;
  if (rounded > 17 * 60 + 30) return "06:30";
  const hours = Math.floor(rounded / 60);
  return `${String(hours).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

/** Eighteen holes of sample scoring, shaped like a published card. */
export function demoScorecard(playDate: string): PortalScorecard {
  const pars = [4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];
  const holes = pars.map((par, index) => {
    const strokeIndex = ((index * 7) % 18) + 1;
    const handicapStrokes = strokeIndex <= 14 ? 1 : 0;
    const grossStrokes = par + (index % 4 === 0 ? 1 : 0);
    const netStrokes = grossStrokes - handicapStrokes;
    const diff = netStrokes - par;
    const netPoints = diff <= -1 ? 3 : diff === 0 ? 2 : 1;
    const grossPoints = grossStrokes === par ? 2 : grossStrokes === par - 1 ? 3 : 1;
    return {
      hole: index + 1,
      par,
      strokeIndex,
      grossStrokes,
      handicapStrokes,
      netStrokes,
      grossPoints,
      netPoints,
    };
  });
  const grossStrokes = holes.reduce((sum, hole) => sum + hole.grossStrokes, 0);
  const netStrokes = holes.reduce((sum, hole) => sum + (hole.netStrokes ?? 0), 0);
  const grossPoints = holes.reduce((sum, hole) => sum + hole.grossPoints, 0);
  const netPoints = holes.reduce((sum, hole) => sum + (hole.netPoints ?? 0), 0);
  return {
    roundId: `demo-round-${playDate}`,
    dayNumber: 1,
    playDate,
    state: "final",
    version: 3,
    publishedAt: `${playDate}T18:20:00+08:00`,
    playingHandicap: SAMPLE_PLAYING_HANDICAP,
    courseHandicap: 15,
    grossStrokes,
    netStrokes,
    grossPoints,
    netPoints,
    holesCounted: 18,
    holesTotal: 18,
    holes,
  };
}

/** The complete demo portal: one player, two playing days, a start today and one card. */
export function demoPortalState(now: Date = new Date()): PortalState {
  const today = manilaToday(now);
  const tomorrow = addIsoDays(today, 1);
  const dateLabel = new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(`${today}T12:00:00+08:00`));

  const entry: PortalEntry = {
    tournamentId: "bamboo-tee-2026",
    eventName: "Bamboo Tee (sample)",
    eventDate: today,
    dates: [today, tomorrow],
    startFormat: "shotgun",
    firstTeeTime: "06:30",
    state: "published",
    status: "ok",
    reasons: [],
    frozenIndex: SAMPLE_INDEX,
    playingHandicap: SAMPLE_PLAYING_HANDICAP,
    category: "Regular",
    tee: "White",
    flight: "Flight A",
    paymentStatus: "paid",
    published: true,
    start: { dayNumber: 1, hole: 10, wave: null, time: demoTeeTime(now) },
    starts: [{ dayNumber: 1, hole: 10, wave: null, time: demoTeeTime(now) }],
    scorecards: [demoScorecard(today)],
  };

  return {
    linked: true,
    player: { ...SAMPLE_PLAYER },
    entries: [entry],
  };
}

export function demoGroupMates(): string[] {
  return [...SAMPLE_GROUP].map((name) => name.toUpperCase());
}

/** A published board with the sample player in it, for the demo build of the leaderboard. */
export function demoBoard(playDate: string): LiveBoardPayload {
  const sample: [string, string, number, number, string][] = [
    ["Benjamin Bautista", "Flight A", 38, 71, "demo-player-ben"],
    [SAMPLE_PLAYER.name, "Flight A", 36, 73, SAMPLE_PLAYER.id],
    ["Carlos Castillo", "Flight A", 35, 74, "demo-player-carlos"],
    ["Felipe Marquez", "Flight B", 34, 75, "demo-player-felipe"],
    ["Gregorio Padilla", "Flight B", 33, 76, "demo-player-greg"],
    ["Noel Yulo", "Flight B", 32, 77, "demo-player-noel"],
    ["Rogelio Sarmiento", "Flight C", 30, 79, "demo-player-rogelio"],
    ["Juan Dela Cruz", "Flight C", 29, 80, "demo-player-juan"],
  ];
  const rows: LiveBoardRow[] = sample.map(
    ([playerName, flightName, points, strokes, playerId]) => ({
      playerId,
      playerName: playerName.toUpperCase(),
      flightName,
      points,
      strokes,
      holesCounted: 18,
      holesTotal: 18,
      photoPath: null,
    }),
  );

  return {
    roundId: `demo-round-${playDate}`,
    eventName: "Bamboo Tee (sample)",
    dayNumber: 1,
    playDate,
    version: 3,
    state: "final",
    publishedAt: `${playDate}T18:20:00+08:00`,
    rows,
  };
}

/** "Thu, Nov 12" for the demo banner, so the sample date is never mistaken for a real one. */
export function demoDateLabel(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(now);
}

const DEMO_GROUPS = [
  {
    number: 1,
    hole: 1,
    time: "06:30",
    flight: "Flight A",
    names: ["Benjamin Bautista", "Carlos Castillo", "Felipe Marquez"],
  },
  {
    number: 2,
    hole: 1,
    time: "06:40",
    flight: "Flight A",
    names: ["Antonio Alcantara", "Gregorio Padilla", "Noel Yulo"],
  },
  {
    number: 3,
    hole: 2,
    time: "06:30",
    flight: "Flight B",
    names: ["Rogelio Sarmiento", "Juan Dela Cruz", "Adela Reyes"],
  },
  {
    number: 4,
    hole: 2,
    time: "06:40",
    flight: "Flight B",
    names: ["Bernadette Cruz", "Carmela Lim", "Dolores Tan", "Elena Uy"],
  },
  {
    number: 5,
    hole: 10,
    time: "12:30",
    flight: "Flight C",
    names: ["Gloria Ramos", "Helen Sy", "Imelda Tan"],
  },
  {
    number: 6,
    hole: 10,
    time: "12:40",
    flight: "Flight C",
    names: ["Fe Lim", "Boyet Cruz", "Jing Tan"],
  },
] as const;

/** A sample published draw, so the demo build shows the real pairings layout on a phone. */
export function demoPairings(now: Date = new Date()): PublicPairings {
  return {
    tournamentName: "Bamboo Tee (sample)",
    dateLabel: demoDateLabel(now),
    startFormat: "shotgun",
    firstTeeTime: "06:30",
    groups: DEMO_GROUPS.map((group) => ({
      number: group.number,
      startHole: group.hole,
      time: group.time,
      flight: group.flight,
      players: group.names.map((name) => ({ id: null, name, photoPath: null })),
    })),
  };
}

/** A matching sample programme, so the day chips and the player cards can be seen in the demo. */
export function demoProgramme(now: Date = new Date()): PublicProgramme {
  const today = manilaToday(now);
  const players = DEMO_GROUPS.flatMap((group) =>
    group.names.map((name) => ({
      name,
      homeCourse: "Iloilo Golf & Country Club",
      index: 12.4,
      category: "Regular",
      flight: group.flight,
    })),
  );
  return {
    days: [
      {
        dayNumber: 1,
        label: "Day 1",
        playDate: today,
        startTime: "06:30",
        players: DEMO_GROUPS.map((group) => ({
          name: group.names[0],
          teeTime: group.time,
          startHole: group.hole,
          confirmed: true,
        })),
      },
    ],
    players,
    rulesOfPlay: null,
  };
}
