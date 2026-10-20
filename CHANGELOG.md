# Changelog

All notable changes to TeeLine Golf. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning rules are in [`docs/VERSIONING.md`](docs/VERSIONING.md). Versions before 1.0.0 are
pre-release: usable for testing, not yet signed off by the club.

Each entry lists the database migrations that ship with it and whether they are applied to the live
Supabase project, because the code and the database are released separately.

## [Unreleased]

Nothing yet.

## [0.20.0] - 2026-10-20

A real footer, and the legal pages the site was missing.

### Added
- **Photographic capability cards.** Each of the three cards now leads with a real photograph,
  treated down to a duotone in the club's green and scrimmed where the text sits, so it reads as
  atmosphere rather than stock imagery. The image scales on hover; nothing else moves. Sourced from
  Pexels under its free licence, no faces identifiable, no watermarks, and the sources are recorded in
  `docs/photo-credits.md`. The landscape shot of the fairway at dawn is committed alongside them for
  later use.
- **`/privacy` and `/terms`**, written from the data model rather than invented: what is collected,
  what the public pairings page is allowed to show, that photographs need recorded consent, and the
  rights under RA 10173. Both are marked **draft** at the top, because the club has not reviewed them,
  and the two answers only the club can give — the retention period and the privacy contact — are left
  as visible placeholders rather than guessed.
- **A four-column footer** with the club, product and legal links, a copyright bar carrying the
  version, and a photography credit. The old footer was a logo, one line and a sign-in link, which is
  why the page looked like it stopped rather than ended.

### Notes
- The legal copy lives as markdown and is generated into `src/content/legal` by
  `scripts/gen-legal.mjs`, so the club's adviser can correct it without touching JSX.

## [0.19.0] - 2026-10-20

Real scroll motion, and the content below the hero treated as a designed page rather than a leaflet.

### Added
- **Lenis and GSAP ScrollTrigger**, loaded after the page is interactive. Lenis gives the page its
  weight; ScrollTrigger runs the reveals. Both are imported inside an effect, so neither is in the
  first paint and the hero never waits on a bundle. The page also works without them: reveals animate
  *from* an offset, so with no script, and with `prefers-reduced-motion: reduce`, every section is
  simply already there.
- `data-motion` hooks: `reveal` for a section that arrives once, `group` and `item` for a staggered
  set, and `parallax` for decorative layers.

### Changed
- **The sections below the hero now have a rhythm.** A consistent vertical beat, a card treatment for
  the three capabilities with a lift on hover, the workflow as a timeline with numbered discs and
  rules, and the pairings callout as a dark band rather than a footnote.

## [0.18.2] - 2026-10-20

Two layout bugs that the first real screenshot exposed. Neither was visible to the type checker, the
unit suite, the build or the browser harness, because all of them check behaviour rather than
composition.

### Fixed
- **The stat strip ran off the left edge.** It is a sibling of `.hero-content`, so it inherited none of
  that block's width, margin or padding: it went full width and the Entries tile was cut off, while the
  headline above it was indented. It now takes the same box, so the two columns line up.
- **The carousel heading was ivory on ivory.** `.strip-head h2` was `#f7f5ee`, which was right when the
  strip sat over the dark hero. Once the strip moved onto the page, the heading became invisible. It now
  uses `--ink`, which flips with the theme.

## [0.18.1] - 2026-10-20

A performance fix for the largest paint on the public landing page.

### Fixed
- **The hero headline was invisible during its own entrance, which delays LCP rather than decorating
  it.** Chrome does not count an element painted at `opacity: 0` as an LCP candidate. The hero already
  carried an older `hero-arrive` animation starting from zero, and the 0.18.0 motion pass added a
  second one on the `h1`, so removing the hero photograph did not help: the largest paint was still
  waiting on an animation. The headline and the copy are now at full opacity in the first frame and
  do not animate at all. The eyebrow, actions and stat strip keep their stagger as movement only, via
  `rise-in-transform`, which never touches opacity.

## [0.18.0] - 2026-10-20

The landing page moves from a flat sports layout to a live one: gradients, motion and inline SVG in
place of the illustrated background.

### Changed
- **The hero is painted, not photographed.** The illustrated course image is gone. The field is
  layered radial and linear gradients with two slow drifting glows, inline SVG contours, yardage arcs
  and a flag, and a masked hairline grid. Nothing is downloaded, and all of it is vector.
- **Motion, in CSS only.** The glows drift over 22 and 26 seconds, the contour layer settles in, and
  the eyebrow, headline, copy, actions and stat strip rise in on a 70ms stagger. Every animation
  touches only `transform` or `opacity`, so the compositor runs it without layout or paint work. The
  page stays server rendered and the motion costs no hydration.
- **The stat strip lost its rules.** Four cells separated by a 1px seam read as a table, so they are
  now soft gradient tiles with an inner highlight. The schedule band gets a gradient field instead of
  a flat slab.
- **The event strip is a real carousel.** It always shows the open event and an explicit "no upcoming
  events yet" card, and advances on its own every 6.5 seconds. Pausing on hover or focus, the arrow
  keys and `prefers-reduced-motion` all still work.
- **The strip no longer overlaps the hero.** It was pulled up 44px over the hero's foot, which put
  its heading across the new stat strip.

### Added
- `carouselSlides` in `src/lib/public/slides.ts`, with tests for zero, one, two and three open
  events, including that no empty card is invented when there are real ones.

## [0.17.0] - 2026-10-20

The AVP demo-video workstream, merged from `avp/demo-0.9`, which was the last local branch holding
unmerged work.

### Added
- **The AVP demo-video toolchain**: a fixture generator that produces a draw and a published snapshot,
  the step script that drives the recording, the capture and phone-scene tools, and the small public
  form hook the demo needs. It records the product being used end to end rather than describing it.
- Development dependencies for the video toolchain. They are build-time only; nothing is added to the
  application bundle.

### Notes
- `.gitignore` carries both the Vercel link state and the demo-video output folders. That was the only
  conflict in the merge, and both sides were kept, so neither was lost.

## [0.16.0] - 2026-10-20

The benchmark pass on the public landing page, and the research behind it.

### Added
- **`docs/public-landing-benchmark.md`**: sixteen sports sites compared on display type, hero
  treatment, event display and athlete highlights, from the NBA and Formula 1 to the PGA Tour, LIV
  and an amateur association. Its conclusion is that display type is sans almost everywhere in sport,
  that a sports hero is an event frame rather than destination photography, and that events are shown
  as data rather than as mood copy. The only serif displays in the sample belong to the
  institution-first golf bodies.
- **A four-cell stat strip in the hero**: entries, cut-off, days and first tee, set in tabular
  numerals at 30px. This is the benchmark's first move, "put a number where the slogan would go". Every
  value is the event's own, and the strip is absent when no event is open.

### Changed
- The hero is 680px rather than 720 to 900: a frame for the event, not a landscape to scroll past.
- Public buttons square off to 4px against flat colour bands, and the small labels carry the weight.
  The signed-in app keeps its own radii and its serif.
- **Removed three pieces of brochure furniture**: the glass note card, the artwork caption and the
  "scroll to explore" cue. All three are travel-page conventions, and none of them told a visitor
  anything about the event.

## [0.15.0] - 2026-10-20

The public landing page becomes a sports page, two migrations that were written but unapplied are now
live, and two desk display bugs are fixed.

### Changed
- **The public landing page now reads as sport rather than as travel.** The display face moves off
  Cormorant Garamond, a serif, onto Bebas Neue with the bundled sans for labels: uppercase, tight,
  large, and numerals set tabular so they read like a scoreboard. The gold italic flourish in the hero
  is gone, because a flourish is what made it look like a brochure. Everything is scoped to
  `.teeline-site`, so the desk, the player area and print keep the calm serif they were designed with.

### Added
- **A schedule strip on the landing page.** The featured event's days as a fixtures band, one cell per
  day with the weekday, date and month. Every value comes from the event row; nothing is inferred, and
  the weekday is formatted on the server in Manila time so the markup cannot shift across midnight or
  between browsers.

### Fixed
- **The registration desk can read the event instructions again** (gap 20). The "Event instructions"
  panel printed its heading and nothing under it, while the same text is shown to players on the entry
  form, so the desk was asked to check instructions it could not see. It now renders, keeps the
  organizer's line breaks, and says where to add them when none are set. The entry form keeps those
  breaks too: since 0.14.0 the Settings field is a real multi-line box, and a four-step list was being
  collapsed into one sentence. A field holding only spaces counts as empty rather than rendering a
  blank box.

- **A signed-in account with no club now gets the truth instead of a dead end** (gap 18). `getDeskMember`
  threw a plain error with a message, the store folded it into the generic failure state, and the empty
  state said "The tournament desk did not load" next to a Retry button that could never help. The
  membership problem is now a typed reason kept apart from a failed read, and the screen says the
  account is not in a club, what that means, and who can fix it. A test pins that none of the three
  access problems offers a retry.

### Database
- `20261033000000_public_open_events.sql` and `20261034000000_course_maps.sql` were applied to the live
  project on 20 Oct 2026, and `supabase migration list --linked` shows local and remote in step at
  eighteen migrations. `public_open_events()` answers with the anon key of a visitor and returns the
  24th Bamboo Tee, so the landing page strip now has real data behind it. `course_maps` reads for the
  service role and is refused to anon, which is the intended shape.

## [0.14.0] - 2026-10-20

Three issues the owner reported from using the deployed build, worked at the same time and released
together. No migration.

### Added
- **"Show me" now takes you to the control it names** (#59). Each help step knows the route its control
  lives on. When the control is on another screen the panel closes, navigates, and rings the control
  once the destination has rendered and its box has stopped moving. A request is claimed once, so two
  shells mounted during a layout change cannot draw two rings, and an unclaimed one expires after 15
  seconds. Hidden duplicate anchors are skipped, which matters for the desktop table against the
  mobile cards. If the control is genuinely absent the panel reopens and says so rather than doing
  nothing. All seven desk guides and both player guides were audited; two causes of silent clicks were
  found and fixed: steps had no route at all, and some anchors existed in only one state.
- **A textarea shows all of its text, and resizes from either edge** (#58). A shared
  `ResizableTextarea` measures its content, so nothing sits behind a scrollbar, and both the top and
  bottom edge are full-width drag rails rather than the small browser corner grip. A drag can never
  make the field shorter than its text. Both rails are focusable separators with arrow keys, Page
  keys, Home to fit and End to open fully, because a resize that only works with a mouse is a bug for
  everyone else. It re-measures when the column narrows and when a bundled font arrives late, which is
  how a last line usually gets clipped.
- **Two bottom bars and an installable, offline-capable PWA** (#60). The desk bar holds Today, Draw,
  Register (raised centre), Players and More; the player bar holds My golf, Pairings and Club home. The
  sidebar stays the primary navigation where there is room, and the drawer stays on phones because the
  desk has eleven screens and the bar holds four. The app installs to a home screen with bundled
  icons, and a service worker keeps the shell and the pages actually opened.
- **The offline copy is labelled and bounded** (#60). Every restored screen says it is a saved copy
  and names the time it was saved, and nothing the app would otherwise call live, published or final
  is presented that way from a cache. Signing out clears the snapshots, so a shared desk phone keeps
  no roster after the person holding it walks away. Photos are never cached. Offline writes are
  refused with a sentence that says nothing was queued, rather than replayed later.
- `docs/mobile-benchmark.md`, a comparison of twelve golf and club apps, which decided the bar
  contents. It found that Golf Genius, the biggest platform in this market, has no bottom bar at all
  on its event app, and that none of the twelve documents offline tournament data.

### Changed
- **The player portal has one entry view.** The live page and the saved copy now render the same
  component, so the offline screen cannot show a field the live one hides. The offline page passes an
  English translator, because a static page served with no server cannot read the language cookie.
- A saved desk copy is restored only when the browser reports itself offline. A refusal from the
  server, such as an account with no club membership, is a real answer and is shown as one rather
  than covered with an older copy.

### Known
- The bottom bars were checked with headless Chrome at 390×844 and 1280×900 but are not yet covered by
  `pnpm verify:ui`, which stands at 78 checks. Their item lists have unit tests.
- The offline player view reads in English only, as the note above describes.

## [0.13.1] - 2026-10-19

The desk loads for a signed-in owner. Documentation and a client fix, no migration.

### Fixed
- **The desk did not load on the first render after signing in** (gap 16). `DeskProvider` sits in the
  root layout, so it wraps the sign-in page: its one read ran before the session cookie existed, found
  nothing, and gave up. Signing in is a server action, so the redirect that followed was a client-side
  navigation, the root layout did not remount, and the effect never ran again. The desk told a
  signed-in owner to sign in, and a browser reload appeared to fix it because that remounts
  everything. The load now re-runs when the route changes, and only when the previous attempt found no
  session. Verified against the live project: error, then loading, then ready in four seconds.

### Added
- The retry and the `onAuthStateChange` subscription are kept: they cover a session arriving after the
  first render, from another tab, which the route-change fix does not.

### Database
- No migration ships with 0.13.1. `20261033000000_public_open_events.sql` remains **written, not
  applied** (gap 17).

## [0.13.0] - 2026-10-19

The public page leads with the events a visitor can enter. One migration, **not applied**.

### Added
- **The public landing page leads with the events a visitor can enter** (decision 23). A strip under
  the hero, one slide at a time, showing the club crest, the event name, its dates and day count, the
  start format and first tee time, the entry cut-off with a countdown, and how many are entered, with
  a link into the entry form. The hero headline and its date line switch to the featured event; the
  marketing copy below is untouched. One slide is rendered at a time rather than a translated track,
  because a track leaves the other slides' links focusable unless each is managed by hand. It advances
  every seven seconds, pauses on hover and on focus, stops entirely under `prefers-reduced-motion`,
  and the arrows work from the keyboard.
- `docs/carousel-preview` at `/carousel-preview`, development only, with five events so every state
  is reachable: both date forms, a cut-off inside three days, a cut-off that closes today, no entries
  yet, and a name long enough to wrap.

### Database
- `20261033000000_public_open_events.sql`: **written, NOT applied.** Adds `public_open_events()`, the
  first public function that **enumerates** anything, returning open events only (state `open`,
  cut-off not passed) and a deliberately short field list: no contacts, no club instructions, no fee
  text, no player data. An explicit anon grant, required since 20261031000000 made new functions
  private by default. Self-verifying: it inserts an open, a draft and a closed event, proves only the
  first is listed, checks the payload carries no unexpected field, and rolls the probes back. Until
  it is applied the landing page shows no strip rather than falling back to the sample events.

## [0.12.1] - 2026-10-19

What a signed-in pass against the live project found, written down. Documentation only, no migration.

### Known issues
- **The desk does not load on the first client render after signing in.** Found on the live project
  on 19 Oct 2026 and reproducible: the redirect lands on `/admin` correctly, but the desk says "The
  tournament desk did not load" and the account chip reads "Not signed in · Session unavailable".
  Reloading fixes it every time and every later navigation works. Measured rather than guessed: the
  auth cookie is set and readable at the moment of failure, and **no `/auth/v1/user` request is made
  at all**, so `getUser()` reported a missing session locally rather than being refused. That points
  at the browser client from `@supabase/ssr` seeing no session when the desk store builds it. Not
  fixed: the root cause is not established, and a speculative change to the auth path is worse than a
  reload. It is step 2 of the acceptance test, so `docs/UAT_RUN_SHEET.md` says to expect it once and
  `docs/RUNBOOK.md` carries the workaround. Tracked as gap 16 in `docs/PLAN.md`.

### Documentation
- `docs/PLAN.md` gap 16 records it with the evidence; `docs/RUNBOOK.md` adds it to the failure-mode
  table; `docs/UAT_RUN_SHEET.md` step 2 says to expect it once so the organizer does not write up a
  known issue as a finding.

## [0.12.0] - 2026-10-19

The checks run by themselves now, and the operational documents exist.

### Added
- **CI on every pull request** (`.github/workflows/ci.yml`): typecheck, lint, test and build, plus the
  browser pass in `scripts/verify-ui.mjs` against a real dev server. That gap is what let two bugs
  reach `main`: an alerts panel with ivory text on an ivory background, and a paging rule that sent
  the desk back to page 2. Both passed typecheck, lint, 486 tests and build. CI needs no secrets: with
  no Supabase URL in the environment the app runs on the demo seed, which is what the harness expects.
- `docs/UAT_RUN_SHEET.md`: the walkthrough the organizer works through, printable, with the version
  field to fill in first, what they should see at each of the eight steps, a severity scale and a
  findings table. It corrects the plan's step 3, which said to "save twice" to see the stale-save
  guard refuse: two saves in one tab cannot be stale, so the second succeeds. The test needs two
  browser tabs, and the sheet says so. It also says to skip step 8 rather than mark it failed when
  there is no player account yet.
- `docs/RUNBOOK.md`: deploying, rolling back, and running the event day from a printed sheet if the
  site is down, plus the known failure modes and what they look like. It states the one thing that
  code rollback cannot undo, which is the database, and why every migration so far being additive is
  what makes a code rollback safe on its own.

### Changed
- `.vercel` is ignored, so a Vercel CLI link in a worktree cannot be committed by accident.

### Security
- The `player-photos` bucket now caps uploads at 5 MiB and three image types. It was private and
  member-only already; what it lacked was any limit on what could be put in it. The app shrinks a
  photo to a 900px JPEG on the client, but nothing enforced that at the layer that has to hold.

### Database
- `20261032000000_photo_bucket_limits.sql`: **applied live**, self-verifying.

## [0.11.0] - 2026-10-19

A new function is private unless the migration that creates it grants it.

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

[Unreleased]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.13.1...develop
[0.13.1]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.12.1...v0.13.0
[0.12.1]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/J-Akiru5/golf-management-system-sl/compare/v0.10.0...v0.11.0
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
