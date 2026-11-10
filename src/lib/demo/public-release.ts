"use client";

import { useEffect, useState } from "react";
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

/**
 * The demo starts with every surface released so the existing sample pages stay complete. Holding
 * a surface is a deliberate preview action; the connected 24th event still starts with its real
 * `pairings: false` policy from the database.
 */
const DEMO_HELD: Record<string, PublicReleaseSurface[]> = {};

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

/** The state both the server and the first client render use, before localStorage is read. */
function defaultState(tournamentId: string): DemoReleaseState {
  const state = { tournamentId } as DemoReleaseState;
  for (const surface of PUBLIC_RELEASE_SURFACES) state[surface] = true;
  for (const surface of DEMO_HELD[tournamentId] ?? []) state[surface] = false;
  state.updatedAt = null;
  state.updatedBy = null;
  return state;
}

function buildState(tournamentId: string): DemoReleaseState {
  const stored = readStored()[tournamentId] ?? {};
  const state = defaultState(tournamentId);
  // A stored value wins over the sample default, so a toggle is remembered.
  for (const surface of PUBLIC_RELEASE_SURFACES) {
    if (typeof stored[surface] === "boolean") state[surface] = stored[surface];
  }
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

/**
 * Read the current demo switches. The first render (server and hydration) uses the sample default,
 * then an effect reads localStorage. That keeps SSR and hydration identical while still making a
 * toggle in another tab update the preview.
 */
export function useDemoReleaseState(tournamentId: string): DemoReleaseState {
  const [state, setState] = useState<DemoReleaseState>(() => defaultState(tournamentId));

  useEffect(() => {
    const sync = () => setState(demoReleaseSnapshot(tournamentId));
    sync();
    listeners.add(sync);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      cache.clear();
      sync();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      listeners.delete(sync);
      window.removeEventListener("storage", onStorage);
    };
  }, [tournamentId]);

  return state;
}
