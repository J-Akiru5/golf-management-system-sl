import { describe, expect, it, vi } from "vitest";
import { cardQrPayload, findFieldCard, MAX_PHOTO_BYTES, parseCardQr, readCardPhoto } from "./scan";

const bytes = new Uint8Array([1, 2, 3]);

const reading = {
  engine: "onnx",
  engineVersion: "1",
  players: [
    {
      rowIndex: 0,
      name: "TEST, ALPHA",
      writtenTotal: 80,
      holes: Array.from({ length: 18 }, (_, index) => ({
        hole: index + 1,
        strokes: 4,
        confidence: 0.9,
      })),
    },
  ],
};

describe("readCardPhoto", () => {
  it("refuses a file that is not a photo", async () => {
    const outcome = await readCardPhoto({
      bytes,
      mime: "application/pdf",
      mode: "individual",
      serviceUrl: "https://reader.example/scan",
    });
    expect(outcome).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a photo that is too large for one request", async () => {
    const outcome = await readCardPhoto({
      bytes: new Uint8Array(MAX_PHOTO_BYTES + 1),
      mime: "image/jpeg",
      mode: "individual",
      serviceUrl: "https://reader.example/scan",
    });
    expect(outcome).toMatchObject({ ok: false, status: 413 });
  });

  it("says plainly when no reader is connected instead of inventing scores", async () => {
    const fetchImpl = vi.fn();
    const outcome = await readCardPhoto({
      bytes,
      mime: "image/jpeg",
      mode: "individual",
      serviceUrl: undefined,
      fetchImpl,
    });
    expect(outcome).toMatchObject({ ok: true, available: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the photo to the reader with the bearer token and returns the draft", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(reading), { status: 200 }));
    const outcome = await readCardPhoto({
      bytes,
      mime: "image/jpeg",
      mode: "individual",
      serviceUrl: "https://reader.example/scan",
      token: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(outcome.ok && outcome.available && outcome.result.players).toHaveLength(1);
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://reader.example/scan");
    expect((call[1].headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });

  it("prints only the card id in the QR code, never a link or a name", () => {
    expect(cardQrPayload("player-1")).toBe("player-1");
    expect(cardQrPayload(" 2f6b0f7e-6f5e-4f0e-9f2d-1e3c4b5a6d7e ")).toBe(
      "2f6b0f7e-6f5e-4f0e-9f2d-1e3c4b5a6d7e",
    );
    expect(cardQrPayload("")).toBe("");
    expect(cardQrPayload("https://golf.example/my?ngap=123")).toBe("");
    expect(cardQrPayload("ALPHA, ONE")).toBe("");
  });

  it("reads a card id back and refuses a URL or a malformed value", () => {
    expect(parseCardQr("player-1")).toBe("player-1");
    expect(parseCardQr("fld-player-1-d1-am")).toBe("fld-player-1-d1-am");
    expect(parseCardQr("  player-1  ")).toBe("player-1");
    expect(parseCardQr("https://golf.example/my?ngap=123")).toBeNull();
    expect(parseCardQr("")).toBeNull();
    expect(parseCardQr(null)).toBeNull();
    expect(parseCardQr(123)).toBeNull();
  });

  it("finds the player a printed card names, by either stable id", () => {
    const field = {
      players: [
        {
          playerId: "player-1",
          registrationId: "reg-1",
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
      ],
    };
    expect(findFieldCard(field, "player-1")?.name).toBe("ALPHA, ONE");
    expect(findFieldCard(field, "reg-1")?.name).toBe("ALPHA, ONE");
    expect(findFieldCard(field, "fld-player-1-d1-am")?.name).toBe("ALPHA, ONE");
    expect(findFieldCard(field, "player-2")).toBeNull();
    expect(findFieldCard(field, "https://golf.example/my?ngap=123")).toBeNull();
    expect(findFieldCard(null, "player-1")).toBeNull();
  });

  it("reports a refusal, a bad answer and a dead reader as separate failures", async () => {
    const run = (fetchImpl: unknown) =>
      readCardPhoto({
        bytes,
        mime: "image/png",
        mode: "individual",
        serviceUrl: "https://reader.example/scan",
        fetchImpl: fetchImpl as typeof fetch,
      });
    expect(await run(async () => new Response("no", { status: 500 }))).toMatchObject({
      ok: false,
      status: 502,
    });
    expect(await run(async () => new Response(JSON.stringify({ players: [] })))).toMatchObject({
      ok: false,
      status: 502,
    });
    expect(
      await run(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    ).toMatchObject({ ok: false, status: 504 });
  });
});
