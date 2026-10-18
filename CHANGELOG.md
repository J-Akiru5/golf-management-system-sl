# Changelog

All notable changes to TeeLine Golf. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning rules are in [`docs/VERSIONING.md`](docs/VERSIONING.md). Versions before 1.0.0 are
pre-release: usable for testing, not yet signed off by the club.

Each entry lists the database migrations that ship with it and whether they are applied to the live
Supabase project, because the code and the database are released separately.

## [Unreleased]

Work for the organizer's acceptance test (`feat/uat-readiness`). Not yet released; the next release is
a minor bump (0.6.0) because testers will notice it.

### Changed
- **A connected desk never shows demo data.** It starts empty and fills from the database, so the sample players and the "Bamboo Tee" event no longer appear while loading or after a failed load. The demo build is unchanged.
- **The draw is routed against the saved tees and holes**, not the demo constants. Before this, a rating entered in Settings changed the screen but not the next draw.
- **Settings now save the event itself.** The name, dates, cut-off, start format, group sizes and registration form were never written to the database; only tees, holes, categories and flights were. They are now saved after the setup function has passed its revision guard.
- **The setup guard now actually guards.** The revision it compared against was held in a variable that was rebuilt on every state change, so it was always empty and never refused a stale save. It now shares one copy with the draw writes, which also stops a draw save being refused right after a setup save.
- A hole card is saved only when all 18 holes have a par and a stroke index and no stroke index repeats. The setup call used to fill a blank with par 4 and stroke index equal to the hole number.
- Creating an event works on a club with none: it creates the course, the event and its setup (starter categories and tees), then reloads. Later events copy the current event's categories and flights as new rows.
- The control room's "open questions" list is worked out from the saved setup instead of a fixed note. Demo wording is shown only in the demo; the sample import file is offered only in the demo, because applying it would write invented golfers to a real database.
- The header account chip shows the signed-in member and role, or "Not signed in" with a Sign in link.

### Added
- **Course data confirmation.** An owner or organizer ticks "These tees and holes match the club scorecard" in Settings. Printed sheets carry the placeholder watermark until then, and any later change to a rating, par or stroke index withdraws it. The print status is derived (`missing`, `placeholder`, `official`); it was hard-coded to `placeholder`.
- A version label (version, commit when known, build date) in the desk footer, the sign-in page and the landing page, so a tester can copy it onto the acceptance form.

### Database
- `20261027000000_course_data_confirmed.sql`: adds `tournaments.course_data_confirmed` (additive, default false). **Not applied.** The desk tolerates a database without it: everything else saves, and ticking the confirmation reports the missing column. Apply it before the acceptance test or the placeholder mark cannot be cleared.

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

[Unreleased]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.5.1...develop
[0.5.1]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/J-Akiru5/golf-management-system-sl/releases/tag/v0.1.0
