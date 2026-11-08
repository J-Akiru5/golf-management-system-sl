"use client";

import Link from "next/link";
import { HelpButton } from "@/components/help";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PairingsPrintFooter } from "@/components/print/PairingsPrintFooter";
import { PairingsView } from "@/components/PairingsView";
import {
  PlayerDirectory,
  ProgrammeNav,
  RulesOfPlay,
  TeeTimesBoard,
} from "@/components/public/ProgrammeView";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { addIsoDays } from "@/lib/data/dates";
import { fmtDateLabel, fmtRange } from "@/lib/data/labels";
import { toPublicPairings, toPublicProgramme } from "@/lib/data/public";
import type {
  PublicPairingDay,
  PublicPairingGroup,
  PublicPairings,
  PublicPlayerProfile,
  PublicProgramme,
  PublicTeeTimeDay,
} from "@/lib/data/types";
import { fmtTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { manilaToday } from "@/lib/player/dashboard";
import { useDesk } from "@/lib/store/desk-store";

/** Ten morning start times and eight afternoon start times, a normal shotgun day at the club. */
const SAMPLE_AM_TIMES = [
  "06:30",
  "06:40",
  "06:50",
  "07:00",
  "07:10",
  "07:20",
  "07:30",
  "07:40",
  "07:50",
  "08:00",
] as const;

const SAMPLE_PM_TIMES = [
  "12:30",
  "12:40",
  "12:50",
  "13:00",
  "13:10",
  "13:20",
  "13:30",
  "13:40",
] as const;

/** Morning groups start on holes 1 to 10; the second start is deliberately on the tenth tee. */
const SAMPLE_AM_HOLES = [1, 10, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const SAMPLE_FLIGHTS = ["Flight A", "Flight B", "Flight C"] as const;

/**
 * The sample player pool. Every name is fictional and in the same plain style as the demo seed.
 * The featured reader, Antonio Alcantara, is kept out of the pool so he appears in one group only.
 */
const SAMPLE_NAMES = [
  "Benjamin Bautista",
  "Carlos Castillo",
  "Adela Reyes",
  "Bernadette Cruz",
  "Carmela Lim",
  "Dolores Tan",
  "Elena Uy",
  "Gloria Ramos",
  "Helen Sy",
  "Imelda Tan",
  "Fe Lim",
  "Boyet Cruz",
  "Jing Tan",
  "Gregorio Padilla",
  "Noel Yulo",
  "Rogelio Sarmiento",
  "Joaquin Del Rosario",
  "Felipe Marquez",
  "Ramon Villanueva",
  "Lourdes Bautista",
  "Eduardo Santos",
  "Marilou Garcia",
  "Ricardo Mendoza",
  "Corazon Villamor",
  "Manuel Cordero",
  "Teresa Lazaro",
  "Alfonso Reyes",
  "Beatriz Gonzales",
  "Cesar Salazar",
  "Divina Flores",
  "Enrique Navarro",
  "Fatima Domingo",
  "Gabriel Soriano",
  "Helena Velasco",
  "Ismael Fernandez",
  "Josefina Mercado",
  "Lorenzo Gutierrez",
  "Marisol Vega",
  "Nicolas Agustin",
  "Patricia Aquino",
  "Rafael Bautista",
  "Sofia Bernardo",
  "Miguel Cabrera",
  "Angelica David",
  "Fernando Estrada",
  "Liza Fajardo",
  "Oscar Guevara",
  "Rosario Hernandez",
  "Paolo Ibarra",
  "Marietta Javier",
  "Sergio Lacson",
  "Cecilia Magbanua",
  "Andres Nolasco",
  "Pilar Ocampo",
  "Rene Pacheco",
  "Aurora Quinto",
  "Emilio Rivera",
  "Natividad Sandoval",
  "Arturo Tolentino",
  "Bianca Urbano",
  "Domingo Valdez",
  "Estrella Yap",
  "Francisco Zamora",
  "Grace Abad",
  "Hector Bacani",
  "Irene Calderon",
  "Jaime Dizon",
  "Karen Escobar",
  "Leonardo Fuentes",
  "Monica Galang",
  "Nestor Hidalgo",
  "Olivia Isidro",
  "Pablo Jimenez",
  "Queenie Kintanar",
  "Rodolfo Lorenzo",
  "Salvador Manalo",
  "Teresita Nicolas",
  "Ulysses Ordoñez",
  "Violeta Pascual",
  "Wilfredo Quizon",
  "Xenia Robles",
  "Yolanda Sevilla",
  "Zacarias Torres",
  "Amelia Valenzuela",
  "Bruno Ylagan",
  "Celia Zulueta",
  "Danilo Abella",
  "Editha Barrientos",
  "Fidel Cayanan",
  "Gina Delfin",
  "Hernan Enriquez",
  "Imelda Ferrer",
  "Jorge Gabriel",
  "Kristine Hizon",
  "Luis Ignacio",
  "Myrna Jalandoni",
  "Norberto Katz",
  "Ofelia Ledesma",
  "Pedro Montilla",
  "Rosalie Nery",
  "Silvestre Ozoa",
  "Trinidad Pardo",
] as const;

const SAMPLE_FEATURED_PLAYER = "Antonio Alcantara";

/** Day 1 runs 18 groups, Day 2 runs 12, so the phone layout has two full days to review. */
const SAMPLE_DAY_PLAN = [
  { dayNumber: 1, amGroups: 10, pmGroups: 8 },
  { dayNumber: 2, amGroups: 8, pmGroups: 4 },
] as const;

/**
 * A two-day sample draw for the demo build. Group numbers restart on Day 2 on purpose, so the
 * layout cannot confuse Day 1 group 1 with Day 2 group 1.
 */
function samplePairings(): PublicPairings {
  const firstDay = manilaToday();
  const secondDay = addIsoDays(firstDay, 1);
  const playDates = [firstDay, secondDay];

  let cursor = 0;
  const days: PublicPairingDay[] = SAMPLE_DAY_PLAN.map((plan) => {
    const playDate = playDates[plan.dayNumber - 1] ?? firstDay;
    const label = `Day ${plan.dayNumber}`;

    const morning = SAMPLE_AM_TIMES.slice(0, plan.amGroups).flatMap((time, index) => {
      const hole = SAMPLE_AM_HOLES[index];
      return hole === undefined ? [] : [{ time, hole }];
    });
    const afternoon = SAMPLE_PM_TIMES.slice(0, plan.pmGroups).map((time, index) => ({
      time,
      hole: 10 + index,
    }));
    const slots = [...morning, ...afternoon];

    const dayGroups: PublicPairingGroup[] = slots.map((slot, index) => {
      const number = index + 1;
      const size = index % 4 === 0 ? 4 : 3;
      const flight = SAMPLE_FLIGHTS[index % SAMPLE_FLIGHTS.length] ?? SAMPLE_FLIGHTS[0];
      const featured = plan.dayNumber === 1 && slot.time === "06:40" && slot.hole === 10;

      const players = Array.from({ length: size }, (_, offset) => {
        const pooled = SAMPLE_NAMES[(cursor + offset) % SAMPLE_NAMES.length] ?? SAMPLE_NAMES[0];
        return {
          id: null,
          name: featured && offset === 0 ? SAMPLE_FEATURED_PLAYER : pooled,
          photoPath: null,
        };
      });
      cursor += size;

      return {
        number,
        startHole: slot.hole,
        time: slot.time,
        flight,
        players,
        dayNumber: plan.dayNumber,
        dayLabel: label,
        playDate,
      };
    });

    return { dayNumber: plan.dayNumber, label, playDate, groups: dayGroups };
  });

  const groups = days.flatMap((day) => day.groups);
  groups.sort((a, b) => {
    const byDay = (a.dayNumber ?? 0) - (b.dayNumber ?? 0);
    if (byDay !== 0) return byDay;
    const byTime = a.time.localeCompare(b.time);
    return byTime !== 0 ? byTime : a.number - b.number;
  });

  return {
    tournamentName: "Bamboo Tee (sample)",
    dateLabel: fmtRange(playDates),
    startFormat: "shotgun",
    firstTeeTime: "06:30",
    groups,
    days: [...days].sort((a, b) => a.dayNumber - b.dayNumber),
  };
}

/**
 * A matching sample programme: the same two days, every player from the sample draw, and confirmed
 * tee-time rows that agree with the pairings.
 */
function sampleProgramme(): PublicProgramme {
  const pairings = samplePairings();
  const dayList = pairings.days ?? [];

  const profiles = new Map<string, PublicPlayerProfile>();
  for (const group of pairings.groups) {
    for (const player of group.players) {
      if (profiles.has(player.name)) continue;
      profiles.set(player.name, {
        name: player.name,
        homeCourse: "Iloilo Golf & Country Club",
        index: 12.4,
        category: "Regular",
        flight: group.flight,
      });
    }
  }

  const days: PublicTeeTimeDay[] = dayList.map((day) => ({
    dayNumber: day.dayNumber,
    label: day.label,
    playDate: day.playDate,
    startTime: "06:30",
    players: day.groups.flatMap((group) =>
      group.players.map((player) => ({
        name: player.name,
        teeTime: group.time,
        startHole: group.startHole,
        confirmed: true,
      })),
    ),
  }));

  return {
    days,
    players: [...profiles.values()],
    rulesOfPlay: null,
  };
}

/**
 * The demo build of the player page (no Supabase URL). It reads the frozen published copy in the
 * browser session through the public allow-list projection. With Supabase configured, page.tsx
 * serves the published version from the database instead.
 *
 * The free-text rules live on the tournament, so they show the moment the demo event has some.
 */
export function DemoPairings() {
  const { t } = useI18n();
  const { published, tournament, days, entries, registrations, players } = useDesk();

  if (!tournament) return <NeedsTournament what="The player view" />;

  const programme =
    (published
      ? toPublicProgramme({
          days,
          entries,
          registrations,
          players,
          categories: tournament.categories,
          flights: tournament.flights,
          rulesOfPlay: tournament.rulesOfPlay,
        })
      : null) ?? sampleProgramme();
  const dates = programme.days.length
    ? programme.days.map((day) => day.playDate)
    : tournament.dates;
  const dateLabel = dates.length > 1 ? fmtRange(dates) : fmtDateLabel(dates);
  const pairings =
    (published
      ? toPublicPairings({
          published,
          tournamentName: tournament.name,
          dateLabel,
          startFormat: tournament.config.startFormat,
          firstTeeTime: tournament.config.firstTeeTime,
        })
      : null) ?? samplePairings();

  return (
    <main className="public public-pairings mobile-bar-space">
      <header className="public-head !p-4 sm:!p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <TeeLineLogo variant="reverse" width={144} />
            <span className="leading-tight">
              <b className="block font-display text-[13px] font-semibold">{t("pairings.title")}</b>
              <span className="text-xs text-on-forest-muted">Iloilo Golf &amp; Country Club</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher tone="on-forest" />
            <HelpButton audience="player" screen="pairings" />
          </div>
        </div>
        <p className="overline mt-2 !text-gold">
          {tournament.config.startFormat === "shotgun"
            ? t("pairings.shotgun")
            : t("pairings.twoTee")}{" "}
          · {fmtTime(tournament.config.firstTeeTime)}
        </p>
        <h1 className="font-serif text-[25px] leading-8 font-semibold !text-on-forest sm:text-[40px] sm:leading-[44px]">
          {tournament.name}
        </h1>
        <p className="text-on-forest-muted">{dateLabel}</p>
      </header>

      {!pairings ? (
        <section className="pairings-empty" role="status">
          <h2>{t("pairings.notOutTitle")}</h2>
          <p>{t("pairings.notOutBody")}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link className="btn ghost no-print" href="/pairings#tee-times">
              {t("programme.navTeeTimes")}
            </Link>
            <Link className="btn ghost no-print" href="/">
              {t("pairings.home")}
            </Link>
          </div>
        </section>
      ) : (
        <>
          {programme && <ProgrammeNav programme={programme} hasPairings />}

          <section
            className="grid gap-3"
            id="pairings"
            style={{ scrollMarginTop: "calc(7rem + env(safe-area-inset-top, 0px))" }}
          >
            <h2 className="text-[20px] leading-7">{t("programme.navPairings")}</h2>
            <PairingsView
              pairings={pairings}
              headingLevel="section"
              flightFilter
              you={{ id: null, name: "Antonio Alcantara" }}
            />
            <PairingsPrintFooter eventName={pairings.tournamentName} />
          </section>

          <TeeTimesBoard programme={programme} />
          <PlayerDirectory programme={programme} />

          {programme?.rulesOfPlay && <RulesOfPlay text={programme.rulesOfPlay} />}
        </>
      )}

      <p className="hint no-print">
        {t("pairings.demoFooter")} <Link href="/">{t("pairings.home")}</Link>
      </p>
      <PlayerBottomBar />
    </main>
  );
}
