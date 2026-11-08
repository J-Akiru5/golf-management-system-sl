import { addIsoDays } from "@/lib/data/dates";
import type { PublicPlayerProfileData } from "@/lib/data/public-profile";
import type {
  PublicTeamLeaderboardData,
  PublicTeamPlayerRow,
  PublicTeamRound,
} from "@/lib/data/public-team-leaderboard";
import { demoPlayerId } from "@/lib/demo/ids";
import { manilaToday } from "@/lib/player/dashboard";
import { demoScorecard } from "@/lib/player/demo";

/**
 * Sample data for the public profile and team leaderboard in the demo build. Every name, class and
 * score is fictional. The numbers are stable so the page does not change between renders.
 */

const SAMPLE_TEAMS = [
  ["Antonio Alcantara", "Benjamin Bautista", "Regular", "Class A"],
  ["Carlos Castillo", "Felipe Marquez", "Regular", "Class A"],
  ["Gregorio Padilla", "Noel Yulo", "Senior", "Class B"],
  ["Rogelio Sarmiento", "Juan Dela Cruz", "Senior", "Class B"],
  ["Adela Reyes", "Bernadette Cruz", "Ladies", "Class A"],
  ["Carmela Lim", "Dolores Tan", "Ladies", "Class B"],
  ["Elena Uy", "Gloria Ramos", "Ladies", "Class C"],
  ["Helen Sy", "Imelda Tan", "Regular", "Class C"],
  ["Fe Lim", "Boyet Cruz", "Regular", "Class D"],
  ["Jing Tan", "Manuel Cordero", "Senior", "Class D"],
] as const;

function roundsFor(): PublicTeamRound[] {
  const today = manilaToday();
  const tomorrow = addIsoDays(today, 1);
  return [
    {
      roundId: `demo-round-${today}`,
      dayNumber: 1,
      playDate: today,
      state: "final",
      version: 3,
      publishedAt: `${today}T18:20:00+08:00`,
    },
    {
      roundId: `demo-round-${tomorrow}`,
      dayNumber: 2,
      playDate: tomorrow,
      state: "final",
      version: 2,
      publishedAt: `${tomorrow}T18:20:00+08:00`,
    },
  ];
}

/** Ten complete pairs, two published rounds, and a clear order from first to tenth. */
export function sampleTeamLeaderboardData(): PublicTeamLeaderboardData {
  const rounds = roundsFor();
  const rows: PublicTeamPlayerRow[] = [];

  SAMPLE_TEAMS.forEach((team, index) => {
    const pairNumber = index + 1;
    const pairKey = `pair:${pairNumber}`;
    const [member, guest, category, flight] = team;
    for (const round of rounds) {
      for (const [side, name] of [
        [0, member],
        [1, guest],
      ] as const) {
        const points = Math.max(18, 38 - index - round.dayNumber + side);
        const gross = 82 + index + round.dayNumber + side;
        rows.push({
          roundId: round.roundId,
          dayNumber: round.dayNumber,
          playDate: round.playDate,
          state: round.state,
          version: round.version,
          publishedAt: round.publishedAt,
          playerId: demoPlayerId(name),
          playerName: name,
          flightName: flight,
          categoryName: category,
          pairNumber,
          pairKey,
          grossStrokes: gross,
          netStrokes: gross - 7 - Math.floor(index / 3),
          grossPoints: Math.max(12, points - 8),
          netPoints: points,
          holesCounted: 18,
          holesTotal: 18,
          parTotal: 72,
        });
      }
    }
  });

  return {
    tournamentId: "bamboo-tee-2026",
    eventName: "Bamboo Tee (sample)",
    tieBreak: {
      name: "IGCC countback",
      procedure: "Net team points on holes 16-18, then holes 13-15, then a drawing of lots.",
      version: "1",
    },
    rounds,
    rows,
  };
}

/**
 * The selected sample player, their partner and two sample cards. A name that is not in the ten
 * sample pairs still gets a profile and cards; only the partner is left empty, which is also what a
 * real unpaired entry looks like.
 */
export function samplePlayerProfileData(player: {
  id: string;
  name: string;
  index: number | null;
  category: string | null;
  flight: string | null;
}): PublicPlayerProfileData {
  const teamIndex = SAMPLE_TEAMS.findIndex(
    (team) => team[0] === player.name || team[1] === player.name,
  );
  const team = teamIndex >= 0 ? SAMPLE_TEAMS[teamIndex] : undefined;
  const isMember = team ? team[0] === player.name : false;
  const partnerName = team ? (isMember ? team[1] : team[0]) : null;

  const rounds = roundsFor();
  const cards = rounds.map((round) => ({
    ...demoScorecard(round.playDate),
    roundId: round.roundId,
    dayNumber: round.dayNumber,
    playDate: round.playDate,
    version: round.version,
  }));

  return {
    tournamentId: "bamboo-tee-2026",
    player: {
      id: player.id,
      name: player.name,
      index: player.index,
      category: player.category ?? team?.[2] ?? null,
      flight: player.flight ?? team?.[3] ?? null,
      pairNumber: team ? teamIndex + 1 : null,
    },
    partner:
      partnerName === null
        ? null
        : {
            id: demoPlayerId(partnerName),
            name: partnerName,
          },
    cards,
  };
}
