"use client";

import { useSyncExternalStore } from "react";
import {
  PUBLIC_RELEASE_SURFACES,
  type PublicReleaseState,
  type PublicReleaseSurface,
} from "@/lib/data/public";

/**
 * The local demo release state.
 *
 * The live desk reads and writes the database. The demo build has no database, so this tiny store
 * keeps the same six switches in localStorage. It exists so the Settings preview and the public
 * preview can be seen together without pretending that a local toggle changed production.
 */

const STORAGE_KEY = "teeline.demo.public-release.v1";

/** The 24th Bamboo Tee's real starting state: the pairings are held, everything else is out. */
const DEMO_HELD: Record<string, PublicReleaseSurface[]> = {
  "bamboo-tee-2026": ["pairings"],
};

export type DemoReleaseState = PublicReleaseState & {
  updatedAt: string | null;
  updatedBy: string | null;
};

type StoredValue = Partial<Record<PublicReleaseSurface, boolean>> & {
  updatedAt?: string | null;
  updatedBy?: string | null;
};

type Stored = Record<string, StoredValue>;

let listeners = new Set<() => void>();
const cache = new Map<string, DemoReleaseState>();

function readStored(): Stored {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Stored)
      : {};
  } catch {
    return {};
  }
}

function buildState(tournamentId: string): DemoReleaseState {
  const stored = readStored()[tournamentId] ?? {};
  const state = { tournamentId } as DemoReleaseState;
  for (const surface of PUBLIC_RELEASE_SURFACES) {
    state[surface] = typeof stored[surface] === "boolean" ? stored[surface] : true;
  }
  for (const surface of DEMO_HELD[tournamentId] ?? []) state[surface] = false;
  // A stored value wins over the sample default, so a toggle is remembered.
  if (typeof stored.pairings === "boolean") state.pairings = stored.pairings;
  if (typeof stored.teeTimes === "boolean") state.teeTimes = stored.teeTimes;
  if (typeof stored.roster === "boolean") state.roster = stored.roster;
  if (typeof stored.leaderboard === "boolean") state.leaderboard = stored.leaderboard;
  if (typeof stored.photos === "boolean") state.photos = stored.photos;
  if (typeof stored.rules === "boolean") state.rules = stored.rules;
  state.updatedAt = stored.updatedAt ?? null;
  state.updatedBy = stored.updatedBy ?? null;
  return state;
}

/** Stable snapshot for useSyncExternalStore. */
export function demoReleaseSnapshot(tournamentId: string): DemoReleaseState {
  const cached = cache.get(tournamentId);
  if (cached) return cached;
  const next = buildState(tournamentId);
  cache.set(tournamentId, next);
  return next;
}

/** Change one switch and tell every mounted demo preview. */
export function setDemoRelease(
  tournamentId: string,
  surface: PublicReleaseSurface,
  released: boolean,
): DemoReleaseState {
  const stored = readStored();
  const previous = stored[tournamentId] ?? {};
  stored[tournamentId] = {
    ...previous,
    [surface]: released,
    updatedAt: new Date().toISOString(),
    updatedBy: "Demo organizer",
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage off: the in-memory cache still gives this tab a working preview.
  }
  cache.delete(tournamentId);
  const next = demoReleaseSnapshot(tournamentId);
  for (const listener of listeners) listener();
  return next;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cache.clear();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Read the current demo switches; server rendering gets the sample starting state. */
export function useDemoReleaseState(tournamentId: string): DemoReleaseState {
  return useSyncExternalStore(
    subscribe,
    () => demoReleaseSnapshot(tournamentId),
    () => demoReleaseSnapshot(tournamentId),
  );
}
