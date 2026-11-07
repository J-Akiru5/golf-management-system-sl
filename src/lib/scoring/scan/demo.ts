/**
 * Development-only scan plumbing.
 *
 * The staff app has to be usable in the in-memory demo, where there is no Supabase session and no
 * R2 bucket. These helpers keep that demo inside the same presign/extract routes and the same
 * `normalizeScanResult` contract. They are never enabled in a production build: a real deployment
 * still needs the database, R2 and the optional reader service.
 *
 * The demo reader is deliberately labelled as such. It is not a model and must not be presented as
 * one; it only gives the screen a complete card with a few weak cells so the review path can be
 * exercised end to end.
 */
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { extensionForImageMime } from "./r2";
import type { ScorecardScanResult } from "./types";

const DEMO_PREFIX = "demo-club/r2/scorecards/";
const MAX_BYTES = 12 * 1024 * 1024;

interface DemoObject {
  bytes: Uint8Array;
  mime: string;
}

type DemoGlobal = typeof globalThis & {
  __igccDemoScorecardObjects?: Map<string, DemoObject>;
};

function store(): Map<string, DemoObject> {
  const global = globalThis as DemoGlobal;
  if (!global.__igccDemoScorecardObjects) {
    global.__igccDemoScorecardObjects = new Map();
  }
  return global.__igccDemoScorecardObjects;
}

/** Demo storage/auth are only substitutes in a development build with no database configured. */
export function demoScanEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && !isSupabaseConfigured();
}

export function createDemoScorecardKey(mime: string): string {
  const extension = extensionForImageMime(mime);
  if (!extension) throw new Error("Unsupported image type.");
  return `${DEMO_PREFIX}${crypto.randomUUID()}.${extension}`;
}

export function demoObjectKeyIsOurs(key: string): boolean {
  return key.startsWith(DEMO_PREFIX) && !key.includes("..");
}

export function putDemoScorecard(key: string, bytes: Uint8Array, mime: string): void {
  if (!demoObjectKeyIsOurs(key)) throw new Error("The demo photo key is not valid.");
  if (bytes.length <= 0 || bytes.length > MAX_BYTES) {
    throw new Error("The photo must be between 1 byte and 12 MB.");
  }
  store().set(key, { bytes, mime });
}

export function readDemoScorecard(key: string): DemoObject | null {
  return store().get(key) ?? null;
}

const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];

function checksum(bytes: Uint8Array): number {
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(bytes.length / 4096));
  for (let index = 0; index < bytes.length; index += step) {
    hash ^= bytes[index] ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

/**
 * A deterministic stand-in for the model. Every cell is present; holes 7 and 12 come back weak and
 * hole 16 comes back blank, which is exactly what the amber review UI must handle.
 */
export function demoScanResult(bytes: Uint8Array): ScorecardScanResult {
  const hash = checksum(bytes);
  const players = [0, 1, 2, 3].map((row) => {
    const holes = PARS.map((par, index) => {
      if (row === 3 && index === 15) {
        return { hole: index + 1, strokes: null, confidence: 0.94 };
      }
      const delta = (hash >>> ((row * 5 + index) % 28)) & 3;
      const strokes = par + (delta === 0 ? -1 : delta === 3 ? 1 : 0);
      const weak =
        (row === 0 && index === 6) || (row === 1 && index === 11) || (row === 2 && index === 3);
      return {
        hole: index + 1,
        strokes,
        confidence: weak ? (index % 2 === 0 ? null : 0.72) : 0.96,
      };
    });
    return {
      rowIndex: row,
      name: null,
      holes,
      writtenTotal: holes.reduce((sum, hole) => sum + (hole.strokes ?? 0), 0),
    };
  });

  return {
    players,
    engine: "demo-reader",
    engineVersion: "1",
    raw: { demo: true, bytes: bytes.length, checksum: hash },
  };
}
