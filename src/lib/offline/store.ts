"use client";

/**
 * Browser storage for the offline snapshots. Rules (keys, schema, expiry, wording) live in
 * `cache.ts`; this file only reads and writes them.
 *
 * IndexedDB is used instead of localStorage because the desk read is the whole club directory and
 * localStorage's small quota would fail on a real field. Every function degrades to "no snapshot"
 * when storage is unavailable (private windows, storage disabled) rather than breaking the screen.
 */
import type { PortalState } from "@/lib/player/portal";
import {
  type DeskSnapshot,
  OFFLINE_SCHEMA_VERSION,
  readEnvelope,
  type SnapshotEnvelope,
  type SnapshotKind,
  snapshotKey,
  toPlayerSnapshot,
} from "./cache";

const DB_NAME = "teeline-offline";
const DB_VERSION = 1;
const STORE = "snapshots";
const LAST_DESK_USER = "teeline:last-desk-user";
const LAST_PLAYER_USER = "teeline:last-player-user";
const LAST_AUTH_USER = "teeline:last-auth-user";
const SEEN_PREFIX = "teeline:seen:";

interface StoredSnapshot {
  key: string;
  schema: number;
  savedAt: string;
  userId: string;
  clubId: string | null;
  payload: unknown;
}

const memory = new Map<string, StoredSnapshot>();

const hasIndexedDb = (): boolean => typeof indexedDB !== "undefined";

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A full or blocked localStorage must not stop the app from working online.
  }
}

function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

async function put(record: StoredSnapshot): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory.set(record.key, record);
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
  db.close();
}

async function get(key: string): Promise<StoredSnapshot | null> {
  const db = await openDb();
  if (!db) return memory.get(key) ?? null;
  const result = await new Promise<StoredSnapshot | null>((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve((request.result as StoredSnapshot | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
  db.close();
  return result;
}

async function remove(key: string): Promise<void> {
  memory.delete(key);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export async function saveDeskSnapshot(
  userId: string,
  clubId: string,
  snapshot: DeskSnapshot,
): Promise<string> {
  const savedAt = new Date().toISOString();
  await put({
    key: snapshotKey("desk", userId),
    schema: OFFLINE_SCHEMA_VERSION,
    savedAt,
    userId,
    clubId,
    payload: snapshot,
  });
  writeStorage(LAST_DESK_USER, userId);
  return savedAt;
}

export async function loadDeskSnapshot(
  userId: string,
  now: Date = new Date(),
): Promise<SnapshotEnvelope<DeskSnapshot> | null> {
  const raw = await get(snapshotKey("desk", userId));
  const envelope = readEnvelope<DeskSnapshot>(raw, { kind: "desk", userId, now });
  if (!envelope) return null;
  const payload = envelope.payload as Partial<DeskSnapshot> | null;
  if (!payload?.state || typeof payload.state !== "object") return null;
  return envelope;
}

export async function savePlayerSnapshot(userId: string, state: PortalState): Promise<string> {
  const savedAt = new Date().toISOString();
  await put({
    key: snapshotKey("player", userId),
    schema: OFFLINE_SCHEMA_VERSION,
    savedAt,
    userId,
    clubId: null,
    payload: toPlayerSnapshot(state),
  });
  writeStorage(LAST_PLAYER_USER, userId);
  return savedAt;
}

/**
 * The player page knows its player id, not its account id, so the last player id is remembered
 * when a snapshot is written. Signing out removes both.
 */
export async function loadPlayerSnapshot(
  now: Date = new Date(),
): Promise<SnapshotEnvelope<PortalState> | null> {
  const userId = readStorage(LAST_PLAYER_USER);
  if (!userId) return null;
  const raw = await get(snapshotKey("player", userId));
  const envelope = readEnvelope<PortalState>(raw, { kind: "player", userId, now });
  if (!envelope) return null;
  const payload = envelope.payload as Partial<PortalState> | null;
  if (!payload || !Array.isArray(payload.entries)) return null;
  return envelope;
}

export function lastDeskUserId(): string | null {
  return readStorage(LAST_DESK_USER);
}

/** Records when a path was last opened online, for the offline notice on cached pages. */
export function rememberSeen(path: string): void {
  writeStorage(`${SEEN_PREFIX}${path}`, new Date().toISOString());
}

export function lastSeenAt(path: string): string | null {
  return readStorage(`${SEEN_PREFIX}${path}`);
}

/**
 * A shared phone can change hands without anyone pressing sign out (a session expires, then a
 * second account signs in). When the account id differs from the one that wrote the snapshots,
 * everything is cleared first. Returns true when a clear ran.
 */
export async function noteAuthUser(userId: string): Promise<boolean> {
  const previous = readStorage(LAST_AUTH_USER);
  let cleared = false;
  if (previous !== null && previous !== userId) {
    await clearOfflineData();
    cleared = true;
  }
  writeStorage(LAST_AUTH_USER, userId);
  return cleared;
}

export async function clearDeskSnapshot(userId: string): Promise<void> {
  await remove(snapshotKey("desk", userId));
  if (readStorage(LAST_DESK_USER) === userId) removeStorage(LAST_DESK_USER);
}

/**
 * Signing out on a shared phone must leave no player names, handicap indexes or phone numbers
 * behind. This removes the snapshots, the "last seen" marks, every cache this app owns and the
 * service worker's copy of the pages. It is called before the sign-out form is submitted.
 */
export async function clearOfflineData(): Promise<void> {
  memory.clear();
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
    db.close();
  }

  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("teeline:")) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {}

  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith("teeline-")).map((name) => caches.delete(name)),
      );
    }
  } catch {}

  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_CACHES" });
  } catch {}
}
