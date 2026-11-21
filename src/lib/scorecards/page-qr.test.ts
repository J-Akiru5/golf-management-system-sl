import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cardQrPayload, findFieldCard, parseCardQr } from "./scan";

/**
 * The tabulation page is static HTML, so its QR parser cannot import the server one. These tests
 * hold the two equal and keep the read-back wiring in place: the native scanner where the browser
 * has it, and the day's player pick-list when the code is damaged or the browser cannot read it.
 */
const html = readFileSync(join(process.cwd(), "public/scorecard/index.html"), "utf8");
const card = readFileSync(join(process.cwd(), "src/components/print/Scorecard.tsx"), "utf8");
const block = html.split("// <card-qr>")[1]?.split("// </card-qr>")[0] ?? "";

function pageParser(): (value: unknown) => string {
  const factory = new Function(`${block}; return cardIdFromQr;`);
  return factory() as (value: unknown) => string;
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
    `${scanBlock}; return { cardIdFromQr, fieldCardFor, qrPlaceholder, resolveQrCards, withQrPlayer, pairQrAndRead };`,
  );
  const player = (playerId: string, name: string) => ({
    playerId,
    registrationId: `reg-${playerId}`,
    name,
    group: 1,
    teeCode: "B",
    cls: "A",
  });
  const fields = {
    "1": {
      [nameKey("ALPHA, ONE")]: player("player-1", "ALPHA, ONE"),
      [nameKey("BETA, TWO")]: player("player-2", "BETA, TWO"),
    },
  };
  const dayOf = (entry: { day?: string }) => String(entry.day ?? "1");
  const sessionOf = (entry: { session?: string }) => (entry.session === "PM" ? "PM" : "AM");
  return factory(fields, fieldCardId, nameKey, dayOf, sessionOf) as {
    fieldCardFor: (day: string, id: string) => { playerId: string; name: string } | null;
    qrPlaceholder: (
      id: string,
      stamp: string,
      index: number,
      entry?: { playerId: string; name: string } | null,
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

  it("prints the card id, not the old claim link", () => {
    expect(card).toContain("cardQrPayload(player.id)");
    expect(card).not.toContain("claimUrl");
    expect(card).not.toContain("SITE_URL");
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
