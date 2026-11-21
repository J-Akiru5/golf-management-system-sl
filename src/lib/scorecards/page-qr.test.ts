import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cardQrPayload, findFieldCard, parseCardQr, parseGroupCardQr } from "./scan";

/**
 * The tabulation page is static HTML, so its QR parser cannot import the server one. These tests
 * hold the two equal and keep the read-back wiring in place: the native scanner where the browser
 * has it, and the day's player pick-list when the code is damaged or the browser cannot read it.
 */
const html = readFileSync(join(process.cwd(), "public/scorecard/index.html"), "utf8");
const card = readFileSync(join(process.cwd(), "src/components/print/Scorecard.tsx"), "utf8");
const scorecards = readFileSync(join(process.cwd(), "src/components/print/Scorecards.tsx"), "utf8");
const deskPrint = readFileSync(join(process.cwd(), "src/app/(desk)/print/page.tsx"), "utf8");
const staffPrint = readFileSync(
  join(process.cwd(), "src/app/(staff)/staff/print/page.tsx"),
  "utf8",
);
const block = html.split("// <card-qr>")[1]?.split("// </card-qr>")[0] ?? "";

function pageParser(): (value: unknown) => string {
  const factory = new Function(`${block}; return cardIdFromQr;`);
  return factory() as (value: unknown) => string;
}

interface PageGroup {
  day: number;
  session: string;
  group: number;
}

function pageGroupParser(): (value: unknown) => PageGroup | null {
  const factory = new Function(`${block}; return groupFromQr;`);
  return factory() as (value: unknown) => PageGroup | null;
}

const scanBlock =
  html.split("// ---- The card's QR code ----")[1]?.split("async function shrinkPhoto")[0] ?? "";

function nameKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function fieldCardId(entry: { playerId: string }, day: string, session: string): string {
  return `fld-${entry.playerId}-d${day}-${session.toLowerCase()}`;
}

function scanPage() {
  const factory = new Function(
    "FIELDS",
    "fieldCardId",
    "nameKey",
    "dayOf",
    "sessionOf",
    `${scanBlock}; return { cardIdFromQr, groupFromQr, fieldCardFor, groupMembers, qrPlaceholder, resolveQrCards, withQrPlayer, pairQrAndRead };`,
  );
  const player = (playerId: string, name: string) => ({
    playerId,
    registrationId: `reg-${playerId}`,
    name,
    group: 1,
    dayNumber: 1,
    session: "AM",
    teeCode: "B",
    cls: "A",
  });
  const fields = {
    "1": {
      [nameKey("ALPHA, ONE")]: player("player-1", "ALPHA, ONE"),
      [nameKey("BETA, TWO")]: player("player-2", "BETA, TWO"),
      [nameKey("ÁLVAREZ, ANA")]: player("player-3", "ÁLVAREZ, ANA"),
    },
  };
  const dayOf = (entry: { day?: string }) => String(entry.day ?? "1");
  const sessionOf = (entry: { session?: string }) => (entry.session === "PM" ? "PM" : "AM");
  return factory(fields, fieldCardId, nameKey, dayOf, sessionOf) as {
    fieldCardFor: (day: string, id: string) => { playerId: string; name: string } | null;
    groupMembers: (
      day: string,
      group: number,
      session: string,
    ) => { playerId: string; name: string }[];
    qrPlaceholder: (
      id: string,
      stamp: string,
      index: number,
      entry?: { playerId: string; name: string } | null,
      day?: number | string,
      session?: string,
    ) => Record<string, unknown> & { holes: string[] };
    resolveQrCards: (cards: unknown[], day: string, session: string) => void;
    withQrPlayer: (read: unknown, qr: unknown) => Record<string, unknown>;
    pairQrAndRead: (qrCards: unknown[], readCards: unknown[]) => Record<string, unknown>[];
  };
}

const cases: unknown[] = [
  "player-1",
  " 2f6b0f7e-6f5e-4f0e-9f2d-1e3c4b5a6d7e ",
  "fld-player-1-d1-am",
  "grp-1-am-24",
  "",
  "https://golf.example/my?ngap=123",
  "ALPHA, ONE",
  null,
  undefined,
  123,
  "a".repeat(80),
  "a".repeat(81),
];

describe("printed card QR", () => {
  it("keeps the page's parser equal to the server's", () => {
    const parse = pageParser();
    for (const value of cases) {
      expect(parse(value), String(value)).toBe(parseCardQr(value) ?? "");
    }
  });

  it("holds the card id and nothing else", () => {
    expect(cardQrPayload("player-1")).toBe("player-1");
    expect(pageParser()("player-1")).toBe("player-1");
    expect(pageParser()("https://golf.example/my?ngap=123")).toBe("");
  });

  it("reads a QR code on a scan and keeps the player pick-list as the fallback", () => {
    expect(html).toContain("BarcodeDetector");
    expect(html).toContain("async function readCardQr");
    expect(html).toContain("resolveQrCards(");
    expect(html).toContain("Pick the player from the day's list");
    expect(html).toContain("await openPlayerPicker()");
  });

  it("prints one group code on each sheet and no per-player code", () => {
    expect(card.match(/<QRCodeSVG/g)?.length).toBe(1);
    expect(card).toContain("cardId ?");
    expect(card).toContain("No code");
    expect(card).not.toContain("cardQrPayload(player.id)");
    expect(card).not.toContain("claimUrl");
    expect(card).not.toContain("SITE_URL");
  });

  it("builds the group code from the day, the group's session and the group number", () => {
    expect(scorecards).toContain("groupCardQrPayload(");
    expect(scorecards).toContain("sessionForTeeTime(");
    expect(scorecards).toContain("cardId={cardId}");
    expect(deskPrint).toContain("dayNumber=");
    expect(deskPrint).toContain("pmFirstTeeTime=");
    expect(staffPrint).toContain("dayNumber=");
    expect(staffPrint).toContain("pmFirstTeeTime=");
  });

  it("keeps the page's group parser equal to the server's", () => {
    const page = pageGroupParser();
    const cases: unknown[] = [
      "grp-1-am-24",
      "grp-2-pm-3",
      "player-1",
      "fld-player-1-d1-am",
      "grp-01-am-24",
      "grp-1-AM-24",
      "grp-1-am-0",
      "https://golf.example/my?ngap=123",
      null,
      123,
    ];
    for (const value of cases) {
      const server = parseGroupCardQr(value);
      const parsed = page(value);
      if (!server) {
        expect(parsed, String(value)).toBeNull();
      } else {
        expect(parsed).toEqual({
          day: server.dayNumber,
          session: server.session,
          group: server.groupNumber,
        });
      }
    }
  });

  it("looks a card up the same way the server helper does", () => {
    const page = scanPage();
    const players = [
      {
        playerId: "player-1",
        registrationId: "reg-player-1",
        partnerPlayerId: "",
        partnerRegistrationId: "",
        name: "ALPHA, ONE",
        partner: "",
        team: null,
        group: 1,
        dayNumber: 1,
        playDate: "2026-11-12",
        teeTime: "06:30",
        session: "AM" as const,
        startHole: 1,
        wave: "",
        flight: "A",
        cls: "A",
        formulaClass: "A",
        frozenIndex: 10,
        playingHandicap: 11,
        tee: "Blue",
        teeCode: "B",
      },
    ];
    for (const id of ["player-1", "reg-player-1", "fld-player-1-d1-am"]) {
      expect(page.fieldCardFor("1", id)?.playerId).toBe(findFieldCard({ players }, id)?.playerId);
      expect(page.fieldCardFor("1", id)?.name).toBe("ALPHA, ONE");
    }
  });

  it("builds the group from the day's field list in printed name order", () => {
    const page = scanPage();
    expect(page.groupMembers("1", 1, "AM").map((member) => member.name)).toEqual([
      "ALPHA, ONE",
      "ÁLVAREZ, ANA",
      "BETA, TWO",
    ]);
    expect(page.groupMembers("1", 1, "PM")).toHaveLength(0);
    expect(page.groupMembers("1", 2, "AM")).toHaveLength(0);
  });

  it("keeps a group card on the day and session its code carries", () => {
    const page = scanPage();
    const cards = [
      page.qrPlaceholder("player-1", "s", 0, page.fieldCardFor("1", "player-1"), 1, "AM"),
    ];
    page.resolveQrCards(cards, "2", "PM");
    expect(cards[0]).toMatchObject({
      playerId: "player-1",
      name: "ALPHA, ONE",
      id: "fld-player-1-d1-am",
      day: "1",
      session: "AM",
    });
  });

  it("keeps a group member the reader did not return", () => {
    const page = scanPage();
    const qr = [1, 2, 3, 4].map((number) =>
      page.qrPlaceholder(`player-${number}`, "s", number, {
        playerId: `player-${number}`,
        name: `P${number}, X`,
      }),
    );
    const read = qr.slice(0, 3).map((member) => ({
      name: String(member.name),
      holes: Array(18).fill("4"),
    }));
    const paired = page.pairQrAndRead(qr, read);
    expect(paired).toHaveLength(4);
    expect(paired[3]).toMatchObject({ qrCardId: "player-4", name: "P4, X" });
  });

  it("pairs the unmatched rows by order when the remaining counts agree", () => {
    const page = scanPage();
    const names = ["P1, X", "P2, X", "P3, X", "P4, X"];
    const qr = names.map((name, index) =>
      page.qrPlaceholder(`player-${index + 1}`, "s", index, {
        playerId: `player-${index + 1}`,
        name,
      }),
    );
    const read = [
      { name: "P1, X", holes: Array(18).fill("1") },
      { name: "MISREAD, TWO", holes: Array(18).fill("2") },
      { name: "P3, X", holes: Array(18).fill("3") },
      { name: "MISREAD, FOUR", holes: Array(18).fill("4") },
    ];
    const paired = page.pairQrAndRead(qr, read);
    expect(paired).toHaveLength(4);
    expect(paired[1]).toMatchObject({ qrCardId: "player-2" });
    expect(paired[1]?.holes).toEqual(Array(18).fill("2"));
    expect(paired[3]).toMatchObject({ qrCardId: "player-4" });
    expect(paired[3]?.holes).toEqual(Array(18).fill("4"));
  });

  it("fills a QR card from the day's field, and leaves a stranger for the pick list", () => {
    const page = scanPage();
    const cards = [
      page.qrPlaceholder("player-1", "s", 0, page.fieldCardFor("1", "player-1")),
      page.qrPlaceholder("player-9", "s", 1, null),
    ];
    page.resolveQrCards(cards, "1", "AM");
    expect(cards[0]).toMatchObject({
      playerId: "player-1",
      name: "ALPHA, ONE",
      id: "fld-player-1-d1-am",
    });
    expect(cards[0]?.qrCardId).toBeUndefined();
    expect(cards[1]?.playerId).toBeUndefined();
    expect(String(cards[1]?.note)).toContain("Pick the player from the day's list");
  });

  it("keeps the reader's scores and takes the player from the QR code", () => {
    const page = scanPage();
    const qr = [
      page.qrPlaceholder("player-1", "s", 0, page.fieldCardFor("1", "player-1")),
      page.qrPlaceholder("player-2", "s", 1, page.fieldCardFor("1", "player-2")),
    ];
    const read = [
      { name: "ALPHA, ONE", holes: Array(18).fill("4"), note: "Read by the card reader." },
      { name: "BETA, TWO", holes: Array(18).fill("5"), note: "" },
    ];
    const paired = page.pairQrAndRead(qr, read);
    expect(paired).toHaveLength(2);
    expect(paired[0]).toMatchObject({ name: "ALPHA, ONE", qrCardId: "player-1", verified: false });
    expect((paired[0]?.holes as string[])[0]).toBe("4");
  });

  it("pairs a damaged name by printed order, then resolves it", () => {
    const page = scanPage();
    const qr = [
      page.qrPlaceholder("player-1", "s", 0, null),
      page.qrPlaceholder("player-2", "s", 1, null),
    ];
    const read = [
      { name: "ALPHA,ONE", holes: Array(18).fill("4") },
      { name: "BETA,TWO", holes: Array(18).fill("5") },
    ];
    const paired = page.pairQrAndRead(qr, read);
    expect(paired[0]).toMatchObject({ qrCardId: "player-1", qrPending: true });
    expect(paired[1]).toMatchObject({ qrCardId: "player-2", qrPending: true });
    page.resolveQrCards(paired, "1", "AM");
    expect(paired[0]).toMatchObject({
      playerId: "player-1",
      name: "ALPHA, ONE",
      id: "fld-player-1-d1-am",
    });
  });
});
