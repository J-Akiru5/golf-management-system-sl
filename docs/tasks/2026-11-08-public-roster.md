# Task: public player roster

**Task ID:** `T-0007` (issue #185)
**Branch:** `feat/issue-185-public-roster`
**Base:** `origin/develop` `461cdab`
**Integration target:** `develop`

## What the roster shows

`/roster` lists the confirmed field for the published event:

- the player's name;
- the home club, when one is on file;
- the handicap index frozen at the cut-off;
- the category;
- the flight.

The list is alphabetical. A name search matches part of a name without caring about case or
accents. A flight filter offers all flights plus each distinct flight in the field. An event with
no confirmed players shows an empty state instead of an empty grid.

## What it never shows

The roster is a server-side projection of the same `public_programme()` read used by `/pairings`.
The browser receives only the five fields above. It never receives a playing day, tee time, start
hole, group, pairing key, pairing, rules text, email address, phone number, home address, billing
detail, birthdate, gender, note or photo path. The projection copies each field by name and does
not spread the source object, so a richer registration row cannot leak through by accident. The
`PublicRosterPlayer` type is the complete payload vocabulary.

Player photos stay out of this task. Showing one would need the existing separate public-display
consent projection, not the private photo path. Registration status also stays out because it is
not part of the current published projection.

## Unpublished and failed reads

`public_programme()` returns null while the event is unpublished. The page then renders the privacy
notice and the unpublished empty state, with no roster content. A failed read renders the retry
state and still no roster content. The demo build reads the same session programme as the pairings
demo, so `/roster` works without a database.

## Verification

Focused tests in `src/lib/data/roster.test.ts` cover the projection, the name search, the flight
filter and an explicit leak fixture carrying tee times, pairing keys, contact details, a birthdate,
gender, notes and photo paths. The sitemap test now includes `/roster`.

The full `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` gates were not run in this
worktree because the host was at resource level red. They remain part of the integration gate.
