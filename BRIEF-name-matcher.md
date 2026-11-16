# Brief: scan name matcher (step 1)

You are a builder. Work only in this worktree (branch `agent/name-matcher`). Do not push, merge,
deploy, apply migrations or touch any other branch. Read `AGENTS.md` first and follow it.

## Why

On Day 1 a card read from a photo carried a handwritten name that did not match the registered
player ("Wormley" for GORMLEY, "Um" for LIM). A person found the player by hand. The system must
propose candidates; a person always confirms. The matcher never picks one player.

## What to build

A pure function module in `src/lib/scoring/match/` (no I/O, no React, no Supabase). Files:

- `src/lib/scoring/match/index.ts` re-exports the public API.
- `src/lib/scoring/match/match-player.ts` the implementation.
- `src/lib/scoring/match/match-player.test.ts` Vitest tests.

Build on `src/lib/names` (`searchKey`, `parseName`, `foldAccents`). Read it before you write code.

### API (use these names and shapes)

```ts
export interface CardReading {
  /** The name as read from the card, any order, any case. Required. */
  name: string;
  /** Tee letter read from the card, if any. */
  tee?: "B" | "W" | "L" | null;
  /** The number in the card's HDCP box, if read. For comparison only. */
  cardHandicap?: number | null;
  /** The group or start slot label read from the card, if any. */
  group?: string | null;
}

export interface RoundPlayer {
  playerId: string;
  /** Stored form "SURNAME, GIVEN". */
  name: string;
  tee?: "B" | "W" | "L" | null;
  playingHandicap?: number | null;
  group?: string | null;
  /** True when this player already has a card in this round. */
  hasCard?: boolean;
}

export type MatchReasonCode =
  | "exact-name"
  | "surname-exact"
  | "surname-close"
  | "given-name-match"
  | "given-initial-match"
  | "tee-match"
  | "handicap-close"
  | "same-group";

export interface MatchReason {
  code: MatchReasonCode;
  /** Plain words for the desk, e.g. "surname one letter off". */
  text: string;
}

export interface MatchCandidate {
  playerId: string;
  /** 0 to 1, higher is better. Used only to order candidates. */
  score: number;
  reasons: MatchReason[];
  /** Copied from the player so the desk can mark a duplicate card. */
  hasCard: boolean;
}

export interface MatchOptions {
  /** Most candidates to return. Default 4. */
  limit?: number;
  /** Candidates scoring below this are dropped. Default 0.35. */
  minScore?: number;
}

export function matchPlayers(
  reading: CardReading,
  players: readonly RoundPlayer[],
  options?: MatchOptions,
): MatchCandidate[];
```

### Behaviour

1. The name on the card may be written given-name first ("Tony Lim") or surname first
   ("LIM, TONY"). Compare against both readings. Ignore case, accents, punctuation and word order
   (use `searchKey`).
2. Surname similarity is the main signal. Use edit distance (Damerau-Levenshtein or plain
   Levenshtein, your choice, write it yourself, no new dependencies) scaled by the longer surname
   length. One letter off on a long surname is still a strong match. Also treat a common handwriting
   confusion as cheaper than a random edit: `rn`/`m`, `u`/`n`, `c`/`e`, `l`/`i`, `a`/`o`. Keep this
   to a small table and unit-test it.
3. Given name: full match, then first-initial match, each adds to the score. A missing given name
   must not hurt a good surname match.
4. Tee, playing handicap and group are supporting signals only. A tee that does not match lowers
   the score a little, it never removes a candidate. A card handicap within 1 of the player's
   playing handicap adds a little. The same group adds a little. A missing value adds and lowers
   nothing. Never invent a value.
5. Return at most `limit` candidates, best first, ties broken by name for a stable order. Drop
   candidates under `minScore`. An empty or blank `name` returns `[]`. Do not mutate the inputs.
6. Every candidate carries at least one reason with plain-language text. The desk will show these.
7. Never return a "chosen" or "best" field and never auto-pick. The caller decides.

## Tests (required, Vitest)

Use invented given names. Never use real people's full names. Build a roster of about 12 invented
players that includes near-duplicates, so ranking is meaningful (for example two players whose
surnames are one letter apart).

These nine misreadings from Day 1 must each put the right player first or second. Surname read
on the card, then the registered surname: Wormley / GORMLEY, Um / LIM, Lorona / LORENA,
Homaros / HENARES, Uhlman / LAGMAN, Aunsanan / ALINSANGAN, Alquinos / ALQUIROS,
Jabinugay / JABINIGAY, Clayero / CLAVERO. For each, add a given-name or tee signal case where it
helps and a surname-only case where it does not.

Also test: given-first and surname-first input; accents (TAÑADA vs Tanada); blank name returns [];
a missing given name; a player with `hasCard: true` is returned with `hasCard: true`; limit and
minScore; stable ordering on ties; inputs not mutated; a tee mismatch lowers but keeps a candidate;
no candidate appears without a reason.

## Rules to respect

- Strict TypeScript with `noUncheckedIndexedAccess`. No `any`. No new dependencies.
- Plain language in comments and reason text. No marketing words, no em-dash pile-ups.
- Do not weaken or delete any existing test.
- No fonts, assets or network calls.

## Done means

Run these in this worktree and report the actual output. They must all pass:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

If lint reports format problems, run `pnpm exec biome check --write src/lib/scoring/match` and run
the three commands again. Do not touch files outside `src/lib/scoring/match/`.

When finished, commit on this branch with a plain message (one subject line, no body needed) and
stop. Do not push. In your final message list: files added, the test count, and anything you were
unsure about.
