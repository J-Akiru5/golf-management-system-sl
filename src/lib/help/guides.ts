import { type HelpGuide, key, literal, type WelcomePanel } from "./types";

/**
 * The desk's help, in English.
 *
 * Decision 18 keeps the desk chrome English, so this copy is written here rather than in the three
 * dictionaries: one place to edit, and no pretend translations of "click Publish".
 *
 * Rules for these words: say what the screen does and which control matters, never promise more than
 * the system knows. Facts that would go stale (tee numbers, ratings) do not belong in help.
 */

export const DESK_GUIDES: HelpGuide[] = [
  {
    id: "desk.control-room",
    title: literal("Control room"),
    summary: literal("The one screen with the whole event on it."),
    routes: ["/admin"],
    steps: [
      {
        text: literal(
          "The course map, the start times, the readiness checks and the publish panel all live here.",
        ),
        anchor: "control-map",
      },
      {
        text: literal(
          "Readiness tells you what still blocks publishing; the same problems appear in the bell.",
        ),
        anchor: "control-readiness",
      },
      {
        text: literal(
          "Publishing from here and from Draw & pairings do the same thing: they freeze the list players see.",
        ),
        anchor: "control-publish",
      },
    ],
  },
  {
    id: "desk.scores",
    title: literal("Scores"),
    summary: literal("Enter a card, approve it, resolve a conflict, then publish."),
    routes: ["/scores"],
    steps: [
      {
        text: literal(
          "Open the round from the published draw before the first card. Round setup names the card count, the approval authority, the tie-break policy and the rules version.",
        ),
        anchor: "scores-round",
        route: "/scores/review",
      },
      {
        text: literal(
          "The round opens only when the draw is published and has not moved, and when every setting is present. The screen names the setting that is missing.",
        ),
        anchor: "scores-round-open",
        route: "/scores/review",
      },
      {
        text: literal(
          "Take a photo of the paper card. A reader can propose scores, but the desk checks every value before submitting.",
        ),
        anchor: "scores-scan",
        route: "/scores",
      },
      {
        text: literal(
          "This is a sample scoring round. It uses placeholder pars and stroke indexes and does not write to the database.",
        ),
        anchor: "scores-entry",
        route: "/scores",
      },
      {
        text: literal(
          "Pick the player and the person who marked the card, enter all 18 hole scores, then submit.",
        ),
        anchor: "scores-submit",
        route: "/scores",
      },
      {
        text: literal(
          "The cards list shows what still blocks approval. Low-confidence values need a person to confirm them.",
        ),
        anchor: "scores-cards",
        route: "/scores/review",
      },
      {
        text: literal(
          "When two cards disagree, the hole is a conflict. Record the value the desk checked and why.",
        ),
        anchor: "scores-conflicts",
        route: "/scores/review",
      },
      {
        text: literal(
          "Gross and net boards count only holes that met the verification rule. An incomplete round says how many holes it counts.",
        ),
        anchor: "scores-gross",
        route: "/scores/results",
      },
      {
        text: literal(
          "The net board uses each player's Playing Handicap snapshot. A player without one is left out rather than estimated.",
        ),
        anchor: "scores-net",
        route: "/scores/results",
      },
      {
        text: literal(
          "Finalization stays blocked until every card, hole, net result, tie-break rule and authority is in place.",
        ),
        anchor: "scores-final",
        route: "/scores/results",
      },
    ],
  },
  {
    id: "desk.players",
    title: literal("Players"),
    summary: literal("Finding one player, and reading their entry."),
    routes: ["/players"],
    steps: [
      {
        text: literal("Search matches name, nickname, NGAP ID or home course."),
        anchor: "players-search",
      },
      {
        text: literal(
          "The filters narrow the list by status, pairing, category, gender and home club.",
        ),
        anchor: "players-filters",
      },
      {
        text: literal(
          "Open a player to see their entries, frozen handicap, tee and payment state.",
        ),
        anchor: "players-open",
      },
    ],
  },
  {
    id: "desk.register",
    title: literal("Registration desk"),
    summary: literal("Where public entries arrive."),
    routes: ["/register"],
    steps: [
      {
        text: literal(
          "An entry from the public form lands as Needs review: the player typed it, so someone should look.",
        ),
        anchor: "register-list",
      },
      {
        text: literal(
          "Confirming an entry frees the player for the draw; an entry left unconfirmed will not be placed.",
        ),
        anchor: "register-review",
      },
      {
        text: literal(
          "Correcting a value keeps an audit trail. Nothing is silently overwritten, and the frozen handicap is what the draw uses.",
        ),
      },
    ],
  },
  {
    id: "desk.import",
    title: literal("Handicap imports"),
    summary: literal("Bringing the club's NGAP export in."),
    routes: ["/import"],
    steps: [
      {
        text: literal("Choose the club's NGAP export; nothing is applied until you confirm."),
        anchor: "import-upload",
      },
      {
        text: literal(
          "The tabs show what matched, what is new and what conflicts; apply the resolution when the counts look right.",
        ),
        anchor: "import-tabs",
      },
      {
        text: literal(
          "An index older than the event's stale days is flagged. The frozen index is what the event uses.",
        ),
        anchor: "import-review",
      },
    ],
  },
  {
    id: "desk.draw",
    title: literal("Draw & pairings"),
    summary: literal("Running the draw and publishing it."),
    routes: ["/draw"],
    steps: [
      {
        text: literal(
          "Choose the day of the event to see the players who chose it and the groups they sit in. The draw is made once for the event, so the day narrows the view rather than making a second draw.",
        ),
        anchor: "draw-day",
      },
      {
        text: literal(
          "Make the draw when the entries are in. Re-running later keeps every locked group exactly where it is.",
        ),
        anchor: "draw-run",
      },
      {
        text: literal(
          "Drag a player onto another player to swap the two, or onto a group with room to move them there. A full group offers a swap; a locked group says why it cannot take one. The Swap and Move buttons do the same things without a mouse.",
        ),
        anchor: "draw-drag",
      },
      {
        text: literal(
          "The issues panel lists what blocks publishing and what only warns. A blocking issue stops the publish.",
        ),
        anchor: "draw-issues",
      },
      {
        text: literal(
          "Publishing writes a version players can see. A change afterwards makes a new version, and the page shows the new number.",
        ),
        anchor: "draw-publish",
      },
    ],
  },
  {
    id: "desk.print",
    title: literal("Print center"),
    summary: literal("The sheets for the clubhouse."),
    routes: ["/print"],
    steps: [
      {
        text: literal(
          "Choose the playing day to print. The sheets come from that day's board only, so two days are never mixed on one sheet.",
        ),
        anchor: "print-day",
      },
      {
        text: literal(
          "Print all days lays out a start sheet for every playing day in one print run.",
        ),
        anchor: "print-all",
      },
      {
        text: literal("Pick a sheet: start sheet, pairings, scorecards, or the how-to page."),
        anchor: "print-tabs",
      },
      {
        text: literal(
          "Print with the browser's dialog. The navigation and buttons are left off the sheet; A4 and Letter are both laid out for.",
        ),
        anchor: "print-now",
      },
      {
        text: literal(
          "The version line on the pairings sheet is what a player checks their printed copy against.",
        ),
        anchor: "print-version",
      },
    ],
  },
  {
    id: "desk.course",
    title: literal("Course & holes"),
    summary: literal("The hole pictures and the course card."),
    routes: ["/course"],
    steps: [
      {
        text: literal("Pick a hole to see its illustration and the groups starting there."),
        anchor: "course-holes",
      },
      {
        text: literal(
          "The course card holds the par and stroke index for every hole. It belongs to the course, so a saved change applies to every event, and an edit withdraws the scorecard confirmation.",
        ),
        anchor: "course-card",
      },
    ],
  },
  {
    id: "desk.setup",
    title: literal("Settings"),
    summary: literal("The event's rules and the course setup."),
    routes: ["/setup"],
    steps: [
      {
        text: literal(
          "Set the course, holes, tees, categories and flights here. Course-side changes use the section Save; the session bar shows the state.",
        ),
        anchor: "setup-course",
      },
      {
        text: literal(
          "Handicap rules (allowance, maximum index, stale days) and the start rules live on this screen too.",
        ),
        anchor: "setup-rules",
      },
      {
        text: literal(
          "Flights decide how the draw splits a category, so set them before running the draw.",
        ),
        anchor: "setup-flights",
      },
    ],
  },
];

/** Player help. Keys, not literals: this is read in the reader's own language. */
export const PLAYER_GUIDES: HelpGuide[] = [
  {
    id: "player.my",
    title: key("help.player.my.title"),
    summary: key("help.player.my.summary"),
    routes: ["/my"],
    steps: [
      { text: key("help.player.my.entry"), anchor: "my-entry" },
      { text: key("help.player.my.notListed") },
      { text: key("help.player.my.claim"), anchor: "my-claim" },
      { text: key("help.player.my.link"), anchor: "my-pairings" },
    ],
  },
  {
    id: "player.pairings",
    title: key("help.player.pairings.title"),
    summary: key("help.player.pairings.summary"),
    routes: ["/pairings"],
    steps: [
      { text: key("help.player.pairings.find"), anchor: "pairings-search" },
      { text: key("help.player.pairings.flight"), anchor: "pairings-flight" },
      { text: key("help.player.pairings.read"), anchor: "pairings-groups" },
    ],
  },
];

export const DESK_WELCOME: WelcomePanel = {
  id: "welcome.desk",
  title: literal("Welcome to the tournament desk"),
  body: literal("A one-minute tour, then it stays out of the way."),
  bullets: [
    literal(
      "Entries arrive in Registration desk. Confirm them there and the player becomes ready for the draw.",
    ),
    literal("Draw & pairings runs the draw and lists what blocks publishing."),
    literal(
      "Publishing freezes the list players see and raises the version number, so a printed sheet can be checked against the page.",
    ),
    literal("Print center holds the start sheet, the pairings and the scorecards."),
    literal(
      "This ? button stays in the top bar: it has a step list for every screen, and can point at the control a step means.",
    ),
  ],
  button: literal("Got it"),
};

export const PLAYER_WELCOME: WelcomePanel = {
  id: "welcome.player",
  title: key("help.welcome.player.title"),
  body: key("help.welcome.player.body"),
  bullets: [
    key("help.welcome.player.entries"),
    key("help.welcome.player.pairings"),
    key("help.welcome.player.help"),
  ],
  button: key("help.welcome.player.button"),
};

/** The welcome panel for an audience. */
export function welcomeFor(audience: "desk" | "player"): WelcomePanel {
  return audience === "desk" ? DESK_WELCOME : PLAYER_WELCOME;
}

/** Which player guide a player screen uses. */
export type PlayerScreen = "my" | "pairings";

const PLAYER_SCREEN_ROUTE: Record<PlayerScreen, string> = {
  my: "/my",
  pairings: "/pairings",
};

/** True when a path is the route itself or a record under it, e.g. /players/p-123. */
export function matchesRoute(path: string, route: string): boolean {
  if (route === "/") return path === "/";
  return path === route || path.startsWith(`${route}/`);
}

/** The desk guides, with the guide for the current route first and the rest after it. */
export function deskGuidesFor(path: string): HelpGuide[] {
  const onScreen = DESK_GUIDES.filter((g) =>
    (g.routes ?? []).some((route) => matchesRoute(path, route)),
  );
  const rest = DESK_GUIDES.filter((g) => !onScreen.includes(g));
  return [...onScreen, ...rest];
}

/** The player guides, with the guide for the current screen first. */
export function playerGuidesFor(screen: PlayerScreen): HelpGuide[] {
  const route = PLAYER_SCREEN_ROUTE[screen];
  const onScreen = PLAYER_GUIDES.filter((g) => (g.routes ?? []).includes(route));
  const rest = PLAYER_GUIDES.filter((g) => !onScreen.includes(g));
  return [...onScreen, ...rest];
}

/** Every guide, for the printable cheat sheet and for the integrity test. */
export function allGuides(): HelpGuide[] {
  return [...DESK_GUIDES, ...PLAYER_GUIDES];
}

/** Every anchor any guide points at. */
export function helpAnchors(): string[] {
  return allGuides()
    .flatMap((g) => g.steps.map((s) => s.anchor))
    .filter((a): a is string => typeof a === "string");
}
