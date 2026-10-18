# Changelog

All notable changes to TeeLine Golf. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning rules are in [`docs/VERSIONING.md`](docs/VERSIONING.md). Versions before 1.0.0 are
pre-release: usable for testing, not yet signed off by the club.

Each entry lists the database migrations that ship with it and whether they are applied to the live
Supabase project, because the code and the database are released separately.

## [Unreleased]

Nothing yet.

### Security
- **A new function is private unless the migration that creates it says otherwise.** Two defaults
  stood in the way and they needed different tools. Supabase's *stored* default grants `EXECUTE` on
  new functions in `public` to `anon`, and `alter default privileges … revoke` removes that one.
  Postgres's `EXECUTE` to `PUBLIC` is **hard-coded** and no default-privileges setting can touch it —
  measured, not assumed: after the anon revoke, a probe function's ACL still read
  `{=X/postgres, …}`, and every role inherits through PUBLIC, so anon was still in. An event trigger
  on `CREATE FUNCTION` now revokes the new function from PUBLIC and anon the moment it exists. A
  function that is meant to be public still says so with its own `grant … to anon`, which runs after
  the trigger and survives it — so the exception is written down where a reader looks, instead of
  being the default for everything.

### Database
- `20261031000000_private_functions_by_default.sql`: **applied live**. Self-verifying: it creates a
  function inside its own transaction, reads the ACL the trigger produced, and raises unless the
  posture is right, so a silent no-op cannot be recorded as applied. It did exactly that on the first
  attempt — the PUBLIC half had not worked — which is why the event trigger exists.
- `20261030000000_revoke_anon_execute.sql`: **applied live**. Reaches anon grants that
  `revoke … from public` misses.

## [0.10.0] - 2026-10-18

One hardening fix, with the migration it needs.

### Security
- **The staff-only functions are no longer reachable by an anonymous caller.** The `revoke … from
  public` line in the earlier migrations does not do what it reads as: `public` is Postgres's PUBLIC
  pseudo-role, while Supabase grants `EXECUTE` to the `anon` role **by name**, so revoking from PUBLIC
  leaves that grant in place. `save_draw`, `unpublish_pairings`, `save_event_setup` and
  `sync_notifications` could all be called with the anon key and no session. Nothing was exploitable —
  each function resolves the event and then requires an owner or organizer through `has_club_role`,
  and `auth.uid()` is null for anon, so every one refused — but an unauthenticated request should not
  be able to make the database do that work at all, and one mistake in one role test would be a live
  hole. `20261030000000_revoke_anon_execute.sql` revokes the anon grant and restates the authenticated
  one. The genuinely public functions (`public_pairings`, `public_registration_form`,
  `submit_registration`) keep their anon access, because the pairings page and the entry form work
  signed out.

### Database
- `20261030000000_revoke_anon_execute.sql`: **applied live**. Reaches anon grants that
  `revoke … from public` misses. Safe to re-run. Note that Supabase's default privileges grant
  `EXECUTE` on new functions in `public` to anon, so a future `create or replace function` re-opens
  this unless the revoke is repeated there or the default privileges are changed.

## [0.9.0] - 2026-10-18

The desk runs on the database and nothing else, and the course numbers can be vouched for.

### Changed
- **A connected desk never shows demo data.** It starts empty and fills from the database, so the
  sample players and the "Bamboo Tee" event no longer appear while loading or after a failed load.
  The demo build is unchanged.
- **The draw is routed against the saved tees and holes**, not the demo constants. Before this, a
  rating entered in Settings changed the screen but not the next draw.
- **A hole card is written only as a whole, valid card**: all 18 holes with a par and a stroke index,
  and no stroke index used twice. The payload used to fill a blank with par 4 and the hole's own
  number as its stroke index, recording numbers nobody had entered and making an unfinished card look
  finished. An incomplete card now sends nothing and the stored card is left alone.
- **Settings saves the event itself.** The name, dates, cut-off, start format, group sizes and
  registration form travel in the same guarded `save_event_setup` transaction as the course, so a
  refused save cannot leave half of it behind.
- **Creating an event works on a club that has none**: it creates the course, the event and its
  setup from the starter categories and tees, then reloads. Later events copy the current event's
  categories and flights as new rows. Ids the database did not issue are left off, so it assigns its
  own rather than failing its `::uuid` cast on the starter's demo ids.
- The control room's "open questions" list is worked out from the saved setup instead of a fixed
  note. Demo wording shows only in the demo, and the sample import file is offered only in the demo,
  because applying it would write invented golfers to a real database.
- The header account chip shows the signed-in member and role, or "Not signed in" with a Sign in link.

### Added
- **Course data confirmation.** An owner or organizer ticks "These tees and holes match the club
  scorecard" in Settings, on the course section. Printed sheets carry the placeholder mark until
  then, and any later change to a rating, par or stroke index withdraws it. The print status is
  derived (`missing`, `placeholder`, `official`) instead of hard-coded to `placeholder`.
- A version label (version, commit when known, build date) on the desk, the sign-in page and the
  landing page, so a tester can copy it onto the acceptance form.

### Database
- `20261029000000_course_data_confirmed.sql`: **applied live**. Adds one column,
  `tournaments.course_data_confirmed boolean not null default false`, so an owner or organizer can
  record that the saved tees and holes were checked against the club scorecard. Additive and
  re-runnable. Renumbered from `20261027000000`, which is taken by the applied setup-fields
  migration: two files at one version means the second is recorded as already applied and its
  statements never run.

### Documentation
- `docs/PLAN.md` states that `docs/VERSIONING.md` and the annotated `vX.Y.Z` tags are the single
  source of truth for what production runs; `docs/VERSIONING.md` gains "What production is running".
- `docs/avp/AVP_PRODUCTION_BRIEF.md`: brief for the narrated onboarding demo for the IGCC board, recorded from the `v0.8.0` app with a local voice, Playwright capture and ffmpeg assembly.

## [0.8.0] - 2026-10-18

Help inside the app, a tidier shell, and a fix for a save that was refused when nothing was wrong.

### Added
- **Help centre (#31):** a "?" in every shell with a step list for the screen you are on, a "Show me"
  ring drawn over the control a step names, a first-run welcome, and a printable cheat sheet as the
  Print center's fourth tab. Desk guides are English literals anchored to the real controls; player
  guides are dictionary keys, so they are translated. Seen-state is per user in `help_seen`, with
  localStorage always written, so the welcome shows once per person and once per browser.
- The rail names each icon on hover and focus, and the tooltip says what the alert dot means rather
  than only the label (#32).
- The rail expands into labelled rows and remembers the choice per browser (#32). One variable,
  `--rail-width` / `--rail-pad`, replaces the hard-coded 60px and 112px, so the shell, the status
  strip and the control room's absolutely positioned panels all move with it instead of sitting
  under it. A pre-paint script applies the saved choice, so an expanded rail never flashes compact.
- The public entry form's own copy is translated (#33), so the language choice covers the form and
  not only the page around it.

### Changed
- The theme control is one dropdown — System, Light (Ivory), Dark (Charcoal) — in place of the
  segmented group and the cycling button (#32). The storage contract is unchanged: `starter-theme`,
  with `auto` meaning the key is absent, so saved choices and the pre-paint script keep working.

### Fixed
- **A save was wrongly refused as stale.** `save_event_setup` and `save_draw` both read and bump
  `tournaments.draw_revision`, and both refuse a write naming a stale one, so they have to agree on a
  single number. The client kept a counter for each instead of one between them, so saving the event
  setup invalidated the draw's number: the next draw save was refused with `draw_revision_conflict`
  even though nobody else had touched anything, and saving the draw broke the next setup save the
  same way. There is now one store, one number per tournament, shared by both writers (#34).
- Two shell bugs found in the browser pass while building the rail: the theme dropdown never opened
  because the tooltip nested inside its trigger swallowed the click, and inside the mobile menu it
  opened off the right edge of the screen (#32).

### Database
- `20261028000000_help_seen.sql`: **applied live** on 18 Oct 2026, hand-applied in the SQL editor and
  verified over the API. Written to be re-runnable.
- No other migration ships with 0.8.0. `20261024000000`, `20261025000000`, `20261026000000` and
  `20261027000000` remain applied live.

## [0.7.1] - 2026-10-18

A fix for a failed call the live browser pass found in 0.7.0.

### Fixed
- The alerts bell waits for a connected desk to finish loading before its first stored check. It used
  to send the demo event id (`bamboo-tee-2026`) to `sync_notifications` on every page load, which
  failed with `22P02`; the bell recovered on the next check, but logged a failed request each time.

### Database
- No migration ships with this version.

## [0.7.0] - 2026-10-18

Settings that save, and two desk fixes.

### Added
- The Settings screen is draft-then-save: a page-level **Save all changes** and a **Save** on every
  section, with the section save as the fallback when the bulk write fails. Unsaved sections are
  marked, changes can be discarded, and a failed write leaves the section marked rather than
  pretending it landed.
- `save_event_setup` now carries the tournament-level fields (name, days, state, cut-off, handicap
  rules, start rules, registration wording) in the same manager-only, revision-guarded transaction as
  the course, tees, holes, categories and flights. Settings is owner/organizer only in the UI, the
  same rule the database already enforced.

### Fixed
- The Settings screen no longer claims nothing is written when Supabase is connected.
- The public entry link is built from `NEXT_PUBLIC_SITE_URL` (the deployed domain) and only falls
  back to the browser origin in development, so a link copied on localhost is not sent to players.
- Add a day adds the next calendar day and every day has its own date field; it no longer clones the
  last date.

### Database
- `20261027000000_setup_tournament_fields.sql`: **applied live on 18 Oct 2026.** It drops and
  re-creates `save_event_setup` with the new optional parameters and re-applies the grants. Verified
  over the API: an owner call writes the tournament-level values and returns `{ok, revision}`, the
  row changes in nothing but `draw_revision`, and a desk account is refused with 42501.

## [0.6.1] - 2026-10-18

Fixes for two bugs found by checking the 0.6.0 screens in a real browser. Both had passed
typecheck, lint, build and the whole unit suite.

### Fixed
- Clearing a search, filter or tab now returns to page 1. 0.6.0 stored the page number and only
  *masked* it when the filter changed, so coming back to a filter you had already used dropped you
  on the page you last left that filter on, not the top of the list.
- The alerts panel is readable in the light theme. It paints a page surface but sits inside the dark
  header chrome, which re-points the ink tokens at the ivory-on-dark pair, so in the light theme the
  heading was ivory on ivory and the body copy was barely legible.

### Added
- `pnpm verify:ui`: 36 browser checks against a running dev server, covering the paging rules
  including the print-media hiding, the import review tabs and their progress, the bell's all-clear
  and real-alert states, the focus trap, Escape, the mobile sheet below `lg`, and both themes. It is
  what found both bugs above. It is not part of `pnpm test`, because it needs the server up.

### Database
- No migration ships with 0.6.1. `20261024000000`, `20261025000000` and `20261026000000` remain
  **applied live**.

## [0.6.0] - 2026-10-18

Long lists and the alerts bell. This release also carries the event-setup and notification work from
PR #17, which merged before the version was cut.

> The earlier `[Unreleased]` entry for PR #17 was stale: #17 had already merged when this version was
> written. Its notes moved here with the UI that depends on them.

### Added
- Alerts bell in the shell (#23). It merges the live `validateDraw` issues with the stored
  notifications, de-duplicates the overlap, and keeps the drawer in step with the Draw screen's
  Issues panel. The badge counts unresolved blocking and warning items whatever their read state;
  read state only quiets info notices. Checks are triggered by a data signature, debounced, with no
  polling, and a failed check shows an error instead of an all-clear.
- Paged long lists (#23): the player directory, the registration desk and the import review tabs
  page 50 rows at a time in the browser. A changed search, filter or tab returns to page 1 in the
  same render, ties break on the record id, and a one-page list shows no pager. Print, the draw
  groups and the desk's player search stay unpaged.
- Import review tabs (#23): Needs decision, Decided and Deferred, with a decided count read from the
  same resolution the Apply button uses.
- Event setup, the tee and hole editors, real course-data loading and the paging primitive (#17).

### Fixed
- The pager is kept out of print output, and the start sheet is asserted to carry a whole
  126-player field rather than one page of rows.

### Database
- `20261024000000_event_setup.sql`, `20261025000000_event_setup_errcode_fix.sql`,
  `20261026000000_notifications.sql`: **applied live**. No new migration ships with 0.6.0.

## [0.5.1] - 2026-10-18

Event-setup groundwork and fixes on top of 0.5.0, plus the versioning files. First release whose number in `package.json` matches its tag.

### Added
- `save_event_setup`: one atomic, revision-guarded, manager-only database call for event setup (`21f9961`).
- `CHANGELOG.md` and `docs/VERSIONING.md`.

### Fixed
- Event-setup revision guard hung instead of refusing a stale save (`dba2fa3`).
- Control room layout, rail scrolling and status strip (`7975276`).

### Documentation
- Plan reconciled with the applied migrations (#18) and the pagination and notification decisions recorded (#19, #20).

### Database
- `20261024000000_event_setup.sql`, `20261025000000_event_setup_errcode_fix.sql`: applied live.

## [0.5.0] - 2026-10-18

Versioned publishing and the player area.

### Added
- Versioned publish: players read a frozen snapshot, draw saves are revision-guarded, public pairings page is cached (#15).
- Plan for persisted scheduling and the versioned pairings page (#14).
- Player area at `/my` with a claim step and a read-only view of the player's own entry and start; one sign-in page for players and staff (#16).

### Database
- `20261022000000_versioned_publish.sql`, `20261023000000_player_portal.sql`, `20261023000001_player_portal_grants.sql`: applied live.

## [0.4.0] - 2026-10-18

The registration desk, print sheets and the staff shell.

### Added
- Registration desk and shell components (#9), print-ready tournament sheets and scorecards (#10).
- Session bar, data-status banner and role gate wired into the desk (#12).
- Confirm step on the registration desk (`RegisterConfirm`) (#13).

### Documentation
- Plan amended for pagination, notifications and the post-wiring state (#11).

## [0.3.0] - 2026-10-18

Real database, staff sign-in and the TeeLine brand.

### Added
- Supabase data layer and organizer auth (#5).
- TeeLine Golf rebrand (#7).
- Staff-only auth with `owner` / `organizer` / `desk` roles and registration audit columns stamped by trigger (#8).
- Public tournament entry form and the entry link on Setup. Entries from the link land as Needs review.

### Database
- `20261018000000_supabase_data_layer.sql`, `20261019000000_staff_auth_audit.sql`, `20261020000000_shell_domain.sql`, `20261021000000_public_registration.sql`: applied live.

## [0.2.0] - 2026-10-17

The organizer screens and the design system.

### Added
- Organizer UI on demo data (#1), forest / ivory / gold redesign with the draw control room, profiles and posters (#2).
- Clubhouse design system applied to the tournament office UI (#4).
- Project plan, build spec and agent instructions (#3).

## [0.1.0] - 2026-10-17

Scaffold.

### Added
- Next.js app, routing engine (category, tee, flight, group, start slot), draw checks and the first Supabase schema.
- NGAP CSV import logic with column mapping.

### Database
- `20261017000000_init.sql`: applied live.

[Unreleased]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.10.0...develop
[0.10.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/J-Akiru5/golf-management-system-sl/releases/tag/v0.1.0
