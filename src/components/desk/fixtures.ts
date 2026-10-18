/**
 * Fictional fixtures for the component tests and the dev preview page.
 *
 * Every player here is invented (the same fake names the demo seed uses). Never put real member
 * data in this file: it is imported by tests and by the preview route.
 */
import type { PlayerRecord, RegistrationField } from "@/lib/data/types";
import type { PlayerPickItem } from "./types";

/** A 1x1 transparent PNG, used as a stand-in for a consented photo. */
export const FAKE_PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

const player = (id: string, name: string, over: Partial<PlayerRecord> = {}): PlayerRecord => {
  const [first = name, ...rest] = name.split(" ");
  return {
    id,
    clubId: "igcc",
    firstName: first,
    lastName: rest.join(" ") || "Sample",
    nickname: null,
    name,
    birthdate: "1980-01-01",
    gender: "M",
    homeCourse: "Iloilo Golf & Country Club",
    contactNumber: null,
    email: null,
    ngapId: null,
    createdAt: "2026-10-20T09:00:00+08:00",
    ...over,
  };
};

export const FAKE_PLAYERS: PlayerRecord[] = [
  player("p1", "Antonio Alcantara", { ngapId: "1001", birthdate: "1972-05-04" }),
  player("p2", "Benjamin Bautista", { ngapId: "1002", birthdate: "1960-11-02" }),
  player("p3", "Maria Santos", {
    ngapId: "2300",
    gender: "F",
    birthdate: "1985-03-14",
    photo: FAKE_PHOTO,
    photoConsent: true,
  }),
  player("p4", "Ramon Aguilar", { ngapId: "1992", birthdate: "1975-09-18" }),
  player("p5", "Pedro Villanueva", { ngapId: "1991", birthdate: "1980-05-02" }),
  player("p6", "Juan Dela Cruz", {
    ngapId: "7001",
    nickname: "Boy",
    birthdate: "1988-01-20",
  }),
  player("p7", "Lourdes Salazar", {
    gender: "F",
    birthdate: "1958-07-30",
    homeCourse: "Highland Greens GC (sample)",
  }),
  // A photo on file without consent: the row must not show it.
  player("p8", "Gregorio Padilla", { photo: FAKE_PHOTO, photoConsent: false }),
  // A stub from a deferred import: no birthdate, no gender.
  player("p9", "Aurelio Tamayo", { birthdate: null, gender: null, ngapId: "3002" }),
];

export interface FakePickOptions {
  index?: number | null;
  categoryName?: string | null;
  playingHandicap?: number | null;
  alreadyRegistered?: boolean;
}

/** Wraps a fake player with the routing facts the quick pick shows. */
export const pick = (playerId: string, options: FakePickOptions = {}): PlayerPickItem => {
  const found = FAKE_PLAYERS.find((candidate) => candidate.id === playerId);
  if (!found) throw new Error(`fixtures: no fake player ${playerId}`);
  return {
    player: found,
    index: options.index ?? null,
    categoryName: options.categoryName ?? null,
    playingHandicap: options.playingHandicap ?? null,
    alreadyRegistered: options.alreadyRegistered ?? false,
  };
};

/** The pick list the preview page and the search tests use. */
export const FAKE_PICKS: PlayerPickItem[] = [
  pick("p1", { index: 12.4, categoryName: "Regular", playingHandicap: 14 }),
  pick("p2", { index: -1.2, categoryName: "Senior", playingHandicap: 0 }),
  pick("p3", { index: 8, categoryName: "Ladies", playingHandicap: 7 }),
  pick("p4", { index: null, categoryName: null }),
  pick("p5", { index: 31.4, categoryName: null }),
  pick("p6", {
    index: 18.2,
    categoryName: "Regular",
    playingHandicap: 21,
    alreadyRegistered: true,
  }),
  pick("p7", { index: 22.6, categoryName: "Ladies", playingHandicap: 22 }),
  pick("p8", { index: 21.5, categoryName: "Super Senior", playingHandicap: 20 }),
  pick("p9", { index: null, categoryName: null }),
];

export const FAKE_EVENT = {
  name: "Bamboo Tee (demo sample title)",
  dateLabel: "Nov 12 – 15, 2026",
  cutOffLabel: "cut-off Nov 1, 2026",
  formatLabel: "Shotgun · 6:30 AM",
  needsConfirmationNote:
    "Sample event title and dates: the club has not confirmed them. Day 4 still needs its tee time confirmed.",
};

export const FAKE_FIELDS: RegistrationField[] = [
  {
    id: "caddie",
    label: "Caddie request",
    type: "select",
    options: ["No preference", "Club caddie", "Own caddie"],
    required: false,
    appliesTo: "both",
    help: "A sample extra field.",
    sample: true,
  },
  {
    id: "meal",
    label: "Meal choice",
    type: "select",
    options: ["Chicken", "Fish", "Vegetarian"],
    required: true,
    appliesTo: "member",
    help: "Members only on this event.",
    sample: true,
  },
  {
    id: "cart",
    label: "Cart required",
    type: "checkbox",
    options: [],
    required: true,
    appliesTo: "guest",
    help: null,
    sample: true,
  },
];
