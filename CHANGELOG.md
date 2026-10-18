# Changelog

All notable changes to TeeLine Golf. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning rules are in [`docs/VERSIONING.md`](docs/VERSIONING.md). Versions before 1.0.0 are
pre-release: usable for testing, not yet signed off by the club.

Each entry lists the database migrations that ship with it and whether they are applied to the live
Supabase project, because the code and the database are released separately.

## [Unreleased]

Nothing yet.

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

[Unreleased]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.7.1...develop
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
