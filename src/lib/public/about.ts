/**
 * The About us section's content: the three organizations behind TeeLine Golf and its team.
 *
 * Roles come from the owner's role documents (20 Nov 2026): the President, CXO and Technology Team
 * descriptions. Names and photos come from each person's public profile on syntaxure.dev/about and
 * mdmevents.org/about, bundled under public/team so the page makes no external request.
 */

export type Partner = {
  name: string;
  /** What this organization does for TeeLine, in a few words. */
  role: string;
  detail: string;
  href: string;
  /** The address as shown on the link, without the scheme. */
  hrefLabel: string;
  logo: { src: string; width: number; height: number };
  /** How the logo sits on the dark page: MDM's mark needs a white tile; ZenLabs' is drawn for dark. */
  tile: "white" | "dark";
};

export type TeamMember = {
  name: string;
  title: string;
  focus: string;
  photo: string;
};

export const ABOUT_PROMISE = "Tournament management at the speed of play.";

export const PARTNERS: Partner[] = [
  {
    name: "Syntaxure Labs",
    role: "Builds and runs TeeLine",
    detail:
      "A software studio in Iloilo City. Syntaxure Labs designs, builds and operates the TeeLine platform.",
    href: "https://syntaxure.dev/",
    hrefLabel: "syntaxure.dev",
    logo: { src: "/partners/syntaxure-labs.webp", width: 160, height: 160 },
    tile: "dark",
  },
  {
    name: "MDM Events",
    role: "Runs tournament day on site",
    detail:
      "Event services and event technology: registration, check-in, screens and production on the day.",
    href: "https://mdmevents.org/",
    hrefLabel: "mdmevents.org",
    logo: { src: "/partners/mdm-events.webp", width: 282, height: 160 },
    tile: "white",
  },
  {
    name: "ZenLabs",
    role: "Sets up tournament operations with clubs",
    detail:
      "An operations consultancy that helps a club plan the process, roles and systems before the event.",
    href: "https://zenlabs.me/",
    hrefLabel: "zenlabs.me",
    logo: { src: "/partners/zenlabs.webp", width: 274, height: 120 },
    tile: "dark",
  },
];

export const TEAM: TeamMember[] = [
  {
    name: "Mary Ann Matiling",
    title: "President & Community Partnerships Lead",
    focus:
      "Leads business direction, sales and partnerships with clubs, associations and sponsors.",
    photo: "/team/maryann.webp",
  },
  {
    name: "Zeno Martinez",
    title: "Chief Experience Officer",
    focus:
      "Sets the service standards for organizers, players and sponsors, and leads every post-tournament review.",
    photo: "/team/zeno.webp",
  },
  {
    name: "Jeff Martinez",
    title: "Chief Technology Officer",
    focus: "Owns the technology strategy, architecture, security and reliability of the platform.",
    photo: "/team/jeff.webp",
  },
  {
    name: "Lou Vincent Baroro",
    title: "Software Development Lead",
    focus: "Builds, improves and maintains the TeeLine software.",
    photo: "/team/lou.webp",
  },
  {
    name: "Karl Calimotan",
    title: "Technical Implementation & Support Officer",
    focus: "Configures and tests the system for each tournament, and supports it on the day.",
    photo: "/team/karl.webp",
  },
];
