# Changelog

All notable changes to TeeLine Golf. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning rules are in [`docs/VERSIONING.md`](docs/VERSIONING.md). Versions before 1.0.0 are
pre-release: usable for testing, not yet signed off by the club.

Each entry lists the database migrations that ship with it and whether they are applied to the live
Supabase project, because the code and the database are released separately.

## [0.29.0] - 2026-11-08

### Migrations shipping with 0.29.0
`20261108002000_registration_pairs.sql` is additive and **applied to the live project on 8 November
2026**. The live project has 143 pairs and 283 pair members; pair 124 is complete. The earlier
8 November scheduling migrations were already applied before this release.

### Added
- **The AgentOps queue now carries issues #185, #186 and #187.** T-0007 adds a public roster,
  T-0008 adds the player scorecard and team-format engine, and T-0009 generalises the existing
  Cloudflare R2 client for media and documents. The three contracts are ready but not implemented in
  this commit. No migration and no deployment.
- **The print center can print the player pairings while the draw is still a draft.** When no
  published snapshot exists, the Pairings tab builds the club's sheet from the current board, marks
  every page "DRAFT · NOT PUBLISHED · FOR DESK USE ONLY", and enables the PDF and Excel download.
  The public pages still read only the published snapshot, so players never see a draft. No
  migration.
- **The player roster filters by pairing status (issue #191).** The players list now has All
  players, Paired and Unpaired chips with counts, a shareable `?pairing_status=` parameter, and
  empty states that say which filter is hiding the list. Pairing comes from the active event's
  `teamNo`; a player who is not entered in the event counts as unpaired and the page says so. No
  migration.
- **Member-guest pairs are first-class and can be changed from the desk.** The registration desk,
  the player workspace and the new pair page can assign, replace, move, swap, remove or create a
  pair. A player can be in only one pair per event, and a pair split across two draw groups is a
  blocking issue, so publish stops until it is fixed. The player's own profile shows their pair and
  partner, marked not published until the draw is. Migration `20261108002000` is **applied to the
  live project on 8 November 2026** and verified: 143 pairs and 283 pair members. `answers.teamNo`
  stays as a read-only fallback for one release.

### Fixed
- **The browser check follows the current player demo copy.** After the player home was rewritten,
  the language check still waited for the old sentence and for a "no player area" line that no longer
  exists. It now dismisses the player first-run welcome in its own context, waits for the sample-data
  line the page actually renders, and checks `html[lang=en]` after switching back. Test-only; no
  product change.
- **Lint ignores local Claude worktrees.** `biome.json` excludes `.claude/**`, so `pnpm lint` from
  the main checkout does not treat a nested worktree's `biome.json` as a second root configuration.
  Development-only; no product behavior change. No migration.
- **The test suite runs from a Windows path that contains a space.** `vitest.config.ts` resolves
  the `@/` alias with `fileURLToPath` instead of `URL.pathname`, which produced a leading-slash,
  percent-encoded path. Development-only; no product behavior change. All 149 files and 1519 tests
  pass. No migration.

## [0.28.0] - 2026-11-08

Headline: the staff phone app, a round for every playing day, a draw that works one day and one AM or PM session at a time, per-day publish and player portal, pairings that read at a glance, and day-synced Excel and PDF export.

### Migrations shipping with 0.28.0
All additive. Reported applied to the live project by the owner on 8 Nov 2026 (not independently checked from this tree): `20261106000000_staff_check_in`, `20261108000100_open_round`, `20261108000200_notification_single_read`, `20261108000300_player_self_profile`, `20261108000500_rounds_per_playing_day`, `20261108000600_public_pairings_by_day`, `20261108000700_portal_starts_by_day`.

### Also in this release
- **Staff phone app** at `/staff` (Today, Schedule, check-in, scan card, score entry, print) with its own account sheet, first-run tour, and a desk role that lands there after sign-in.
- **One top bar** shared by the organizer desk, the staff app and the player app (Help, light or dark theme, account chip); the staff app follows the theme.
- **Pairings** list the tee time first, with day chips, AM and PM sections, name search and Find me, and a compact view; the public pairings print as a notice-board sheet.
- **Player app** desktop home and profile management (name, contact).
- **Draw page** class tabs and a Cards or Table view; **Print center** Excel and PDF export follows the day selector, with an All playing days option.
- Known gaps: the day-by-day start sheets, hole grid and poster from the print stream are not in this release; the afternoon start is still set by position rather than per day.

### Added
- **A scoring round can be opened from the published draw (issue #149).** New migration
  `20261108000100_open_round.sql` adds one function, `open_round`, owner and organizer only. It
  creates a draft round for every playing day, opens the day named, copies the published draw into
  round entries and handicap snapshots in one transaction, refuses a stale revision or a draw that
  moved after publish, and names any setting it cannot resolve instead of guessing. `/scores` gets a
  Round setup panel. **Migration written and merged to `develop`, NOT applied to the live project**
  (the CLI account here gets 403); apply it before the first card on 12 Nov.
- **AM or PM beside every registered day (issue #165).** The registration list and Days editor, the
  player profile, the public programme and entry form, and the print day picker show AM or PM with
  the time. A day with no stored choice shows the default (06:30, 12:30, and 11:30 on the last day)
  marked as a default. No migration.
- **The calendar month fits the screen (issue #173).** The month view fills the desk height with no
  page scroll at common desktop sizes, a busy day scrolls inside its cell with a "+n more" sheet,
  and the grid uses a darker `--grid-line` colour guarded by the contrast test. No migration.
- **The card is found by matching the printed card, not by guessing a rectangle.** The photo is
  matched against one stored reference card with SIFT and a RANSAC homography, and the result is
  validated against the printed table before any cell is cropped. On the 111 raw photos the old
  detector missed 14 and misaligned all 97 that it found; the new one finds 111 with a median
  corner error of 7.8 px (98 within 20 px, 109 within 40 px). A detection that cannot be aligned to
  the table is refused as `card_not_detected` with the reason, so a wrong quadrilateral can no
  longer produce digits from the wrong ink. The scan response now carries `confidence`, `decision`,
  `alignment`, `featureInliers`, `reasons` and `quality`, and `detectedBy` can be
  `template_features`. The reference is stored as keypoints, not as a photo, and is rebuilt with
  `scripts/scan/build_card_template.py`. Raw-photo digit accuracy is still not production ready:
  the model's 4/5/6 drift remains, so the desk review step stays.
- **Waves follow the field, and each player can be put in one.** The tee-times screen used to offer
  exactly three wave times. It now lists every wave the day actually has: the field size gives the
  floor (one group on every hole fills a wave), the draw adds any extra wave it used to keep a
  flight whole, and a wave already written on a player is kept. The batch buttons set the time and
  the wave together, and each row has its own wave field for the exceptions. The wave is stored on
  the day assignment, so it survives a reload; it stays internal, because the public page still
  shows only a confirmed time and hole. The column ships in migration `20261104001100`, which is
  **not applied** yet.
- **The reader states its accuracy.** Settings carries a card reader note with the measured figures
  and what they do not mean, and the scan section on `/scores` shows the same two figures in one
  line. The numbers live in one place, so retraining the model updates both screens.
- **The card reader runs a local ONNX model.** Roboflow cannot export this project to ONNX: a
  classification project answers `HTTP 400 onnx is an invalid format for project type
  classification. Please use one of: folder, clip.` and version 4 lists `exports: ["folder"]`, so
  the trained weights stay on their host. The labelled cells are still exported, so
  `scripts/scan/train_onnx.py` trains a small network on them and writes the ONNX file and its
  class list. On the held-out cells the reader reads 0.866 of the validation split and 0.837 of
  the test split; 4, 5 and 6 are the confusions that show up, which is what the amber check flag
  is for. Model files stay out of Git.
- **The reader's draft arrives with its doubts marked.** Use with card now carries each cell's
  confidence into the card form: holes read weakly or not at all are amber, the small label says
  check, and a summary counts filled, weak and blank holes. Values the reader never produced are not
  flagged, so a hand-typed card is not covered in warnings. The reader-unavailable message now says
  the service is not connected rather than only that a reader is unconfigured.
- **One tee time for a shotgun day.** A shotgun wave starts everyone at once, so `/tee-times` now
  offers the event's wave times (wave A at the first tee, each later wave one wave gap after, for
  example 06:30 and 12:30) as a batch. One press fills the time for every player on the day who has
  none, or overwrites every time while keeping each player's hole and confirmation. The per-row time,
  hole and confirmation fields stay for the exceptions. A time without a start hole is now accepted
  while it is unconfirmed, matching the database's own check, because the draw assigns the holes;
  confirming still needs both.
- **Revoke an approved scorecard** on `/scores` (issue #160). A card that should not count (wrong
  marker, duplicate entry, a score ruled unofficial) is withdrawn with a reason, and the standings
  are rebuilt from the cards and resolutions that remain. The card, its entries and its audit row are
  kept, and a finalized round stays locked. A correction is still a new revision, not a revocation.
  The function ships in migration `20261104001000`, which is **not applied** yet.
- **Scoring activity on `/audit`**: `scoring_audit` rows (approvals, rejections, corrections,
  revocations, resolutions and publications) are now readable beside the general `audit_log`.

### Changed
- **Player fields on the score screen are searchable** (issue #163). An event can carry more than a
  hundred players, where a plain dropdown is unusable. The player and marker fields on a card, and
  the player field when scanning, are now type-to-search lists that match names, NGAP ids and home
  courses, keep the keyboard working (arrows, Enter, Escape) and say how many matches are hidden
  once the list is capped.
- **Settings is one section per tab** (issue #161) instead of a nine-section scroll. The tab lives in
  the URL hash, so `/setup#course` and the existing links from the print screen, the registration
  desk and alerts still open the right section, the back button walks the tabs, and a tab shows a dot
  when that section has unsaved changes.

### Fixed
- **Alerts can be marked as read one at a time (issue #171).** Every stored notification and every
  info item now carries a Mark as read control, and the panel header carries Mark all as read. Live
  blocking and warning issues from the draw keep no read control and say why: they clear when the
  cause is fixed, and the badge must keep counting them whatever anyone has read. Read state is per
  person, so two desk members do not read each other's alerts. The panel now also closes when the
  route changes, including a click on the rail or the mobile menu, and it releases the page scroll
  lock when it closes. New migration `20261108000200_notification_single_read.sql` adds one
  function, `mark_notification_read(notification)`, for a single per-user read row. **Migration
  written, NOT applied to the live project**; it is additive (a new function only).

- **Player names on the Scores screen open the player record (issue #170).** The Cards table (the
  player and the marker), the correction notice, the selected player's handicap summary, both
  Stableford boards and the conflict list link each name to `/players/[id]`. The player and marker
  pickers keep their own click target and carry a separate "Open profile" link, so choosing a
  player never navigates away. The link is only painted for an account that may open a staff
  profile page. No migration.
- **The reader no longer warps a card into portrait.** The orientation step tried all four right
  angles; on an 1800x1000 card a 90 degree turn makes the image portrait, its row scores are noise,
  and it could win, after which every cell box (x up to 1733) fell outside the card and the scan
  failed with a server error instead of returning a readable card. Only 0 and 180 degrees are
  considered now, and a card that is not in the template frame is refused as `card_not_detected`
  instead of cropped anyway.

### Added
- **The scorecard screen has its own camera window.** Take photo now opens an in-app preview instead
  of handing off to the operating system's file picker. Every camera the device reports can be
  chosen from a source list, so a laptop webcam or a USB camera works and a dashcam can be added
  later. A guide shaped like the printed card shows what will be kept, the capture is cropped to
  that guide, and a phone held upright is asked to turn sideways. Upload a photo sits in the same
  window as a button, and a blocked camera never stops the desk from attaching a photo.
- **The control room map zooms under the pointer.** Scroll the wheel over the illustrated course, or
  pinch it on a touch screen, and the map scales between 1× and 2.5× around the point you are
  looking at. The drag still pans, its travel grows with the zoom so no bare edge can show, and
  Reset view returns to the whole course. The map is an illustration drawn on a canvas, so zooming
  past 2.5× would only blur it.

### Fixed
- **The calendar marks today.** The month grid rings the current day in gold, fills its date circle
  and labels it Today, so the desk can see where the month actually is without counting cells. The
  list view also marks an event that is on today. The day is calculated in Manila time, since the
  events are stored as dates rather than instants.
- **A phone can sign out again.** The account chip that holds the sign-out button is hidden below
  768px, and the menu it is replaced by had no account or sign-out at all. The menu now ends with
  the signed-in name, their role and Sign out, or a sign-in link when the session failed.
- **The registration desk no longer runs off the right edge.** A card's single column took the
  width of its widest row, so the two-column page pushed the registrations list past the viewport.
  Cards and the list now use a column that can shrink, and a row wraps its actions instead of
  widening the card.
- **The saved theme and rail width survive a page change.** The pre-paint scripts still keep the
  first load from flashing, and the shell now re-applies the choice to `<html>` after hydration and
  on every route. The theme control and the rail toggle read the applied attribute instead of a
  private copy, so two controls on one page can no longer disagree about the current state.

### Scheduling follow-up (8 November 2026)

#### Added
- **A playing day can carry its own afternoon start.** The new field on `/tee-times` saves
  `tournament_days.pm_start_time`; an empty field means the event's `tournaments.pm_first_tee_time`,
  and only a day with neither uses the old 12:30 (or 11:30 on the last playing day). A one-day
  Saturday event no longer borrows the Sunday time. New migration `20261108000800_day_pm_start.sql`
  adds one nullable column and is **additive and NOT applied**.
- **`save_draw` refuses an unnamed whole-event save** once an event has more than one round, so a
  stale caller cannot delete every day's board. New migration
  `20261108000900_save_draw_requires_day.sql` replaces only the existing function body (same
  signature and ACL); **additive and NOT applied**.
- **The unplaced-player alert counts each playing day.** A player drawn on day 1 no longer satisfies
  the check for day 3. New migration `20261108001000_notifications_per_day.sql` replaces only the
  existing function body (same signature and ACL); **additive and NOT applied**.

#### Changed
- **The draw and the Tee times screen read stored session times.** The day's morning start, its own
  afternoon start and the event's afternoon start are read in that order, and a time that came from
  a fallback is marked as a default on screen. A sparse day list (days 1, 2, 4) is keyed by day
  number, not by position.
- **"Take the draw's times" only reads the board on screen.** A board loaded for another playing
  day gives nothing and says so, a player is never given the first group from another day, and only
  the one-letter batch is written to `registration_days.wave` instead of a label such as `D1-AM-A`.
  The Session column takes the desk's recorded session first, then the draw label, then the time.
- **The Tee times screen warns when the field needs a third start.** It names every start time and
  its batch letter for the day, with no fixed two-start cap.
- **The selected playing day survives a reload and an event switch.** It is kept in this browser,
  and switching to an event that plays the same day keeps it; otherwise that event's first playing
  day opens. No schema change.

#### Fixed
- **The draw can no longer hang on an impossible field.** A zero (or non-integer) hole count, a
  group size of zero or less, and a fully occupied start with no free slot now raise a clear error
  instead of looping. `addMinutes` refuses `24:00`, `06:60`, `6:3` and a non-whole minute count
  instead of silently repairing them. Filling a start as it goes no longer reports a class as
  "across starts" when it merely begins in the next empty one.

## [0.27.4] - 2026-11-04

Desk completeness and public correctness, after the four audits.

### Added
- **Bulk entry confirmation** on `/register`: "Confirm N shown" with a count-aware confirmation,
  backed by `confirm_registrations` (migration `20261104000600`, applied). It skips entries with a
  blocking reason, so a batch cannot produce a broken draw.
- **Link an account from the desk**: the player page sets the portal account with
  `link_player_account` (migration `20261104000300`, applied), so "ask the desk to link your entry"
  is now something staff can do.
- **Player delete guard** (migration `20261104000500`, applied): a non-owner delete that would take
  registrations or scoring rows with it is refused with the counts.

### Changed
- **The public programme shows confirmed players only** (migration `20261104000400`, applied). Both
  the player list and the day list exclude `needs_review`.
- **Tee-time "Confirmed" saves the moment it is ticked**, with a revert and an inline error.
- **Payment status is editable** on the registration row, and the control room counts
  `not_recorded` as unpaid.
- **Add player, add caddie and new event keep their data** when a write fails, and offer a retry.
- **"Retry" is now "Reload from database"**, so it no longer looks like it repeats a save.
- **The control room import tile reports the real count.**

## [0.27.3] - 2026-11-04

Production-grade pass before the club staff adopt the desk.

### Added
- **`create_registration`**: one transaction that writes the entry, its playing days and the
  registration-player link, so the desk cannot report a saved entry that the database refused.
  Migration `20261104000000`, applied 4 Nov 2026.
- **Live health check**: `scripts/health-check.mjs` plus a scheduled GitHub workflow, and the
  runbook's backup, rollback and event-week sections.
- **Branded error and not-found pages**, so a wrong link no longer lands on a bare framework error.

### Changed
- **The desk saves what it says it saved.** Re-freeze, remove-entry, publish, unpublish and the
  registration review now wait for the database; failures stay on screen with an error instead of a
  false "Saved" or "Published". `/register` gains a Refresh control and reloads once when the pending
  count rises.
- **Account linking no longer uses a name.** A player links with NGAP number + birthdate, or the
  email the club holds. The old name-based claim is dropped, and the import-player helper is no
  longer executable by a signed-in client. Migration `20261104000100`, applied 4 Nov 2026.
- **`/my` finds the player's group by player id**, falling back to the name only for snapshots that
  predate ids. Migration `20261104000200`, applied 4 Nov 2026.
- **Publication times render in Manila time**, and one inconsistent snapshot row no longer blanks
  the whole pairings page.
- **The legal pages are publishable**: draft banner, internal notes and placeholders removed; the
  account-linking paragraph matches the new rule.

## [0.27.2] - 2026-11-04

The logo lockup and the landing page after entries close.

### Added
- **The landing page keeps showing an event after its entries close.** `public_events()` lists the
  events the club has announced, including ones whose entries have closed, and says whether the entry
  form still applies. The carousel shows "Entries closed" and a pairings link instead of an entry
  button, and the hero drops "Open for entry now". An event stays listed until a week after its last
  playing day. Migration `20261103000000_public_events_entries_closed.sql` is **not applied to the
  live project yet**; until it is, the page falls back to `public_open_events()` and behaves as before.
  No data change.

### Changed
- **The app logo carries the symbol beside the wordmark.** `TeeLineLogo` draws the traced
  course-and-flag symbol to the left of **TeeLine GOLF** in the headers and auth screens, sized to the
  cap height. The public home header gets a wider slot on desktop so the wordmark keeps its size.

## [0.27.1] - 2026-11-02

The club's traced logo becomes the app logo.

### Added
- **The club's logo, traced into vectors.** `public/brand/teeline-*` now holds the stacked lockup
  (primary, reverse, mono), the horizontal version, the symbol, two app icons and the TL monogram,
  traced from `public/photos/TeeLine Golf Brand Identity Board.png` so the letterforms and curves are
  the board's rather than a font approximation. Transparent PNG renders, a sheet and a zip are in
  `docs/brand`. No font is needed to open any file. No migration.

### Changed
- **The club's logo is now the app logo.** The header and auth screens render the traced wordmark
  through `TeeLineLogo`, the app icons are rendered from the traced symbol, the social image is
  rebuilt from the traced reverse wordmark, and the service worker caches the new files. The old
  side-by-side lockup files are removed. No migration.

## [0.27.0] - 2026-11-02

Player mobile/PWA pass, public programme, player scorecard and scorecard corrections.

### Added
- **Player install prompt and mobile shell**: the player pages now offer a dismissible Add to Home
  Screen prompt (the platform prompt on Chromium, Share steps on iOS), the manifest opens at `/my`
  with player shortcuts, and the player bar appears on the public home, pairings, leaderboard, entry
  and FAQ. The leaderboard gets a phone card list instead of a six-column table. No migration.
- **The public programme on `/pairings`**: the page now shows the confirmed tee times for each
  playing day (Day 1, Day 2, …), a public player list (name, home club, frozen index, category and
  flight) and the organizers' rules of play, before the published pairings. A tee time is withheld
  until the desk ticks it confirmed, so a partly entered schedule cannot read as a confirmed start.
  The rules are written in **Settings → Rules of play** and stored on `tournaments.rules_of_play`.
  The anonymous read is `public_programme()`, which returns null unless the event is published; the
  pairings themselves still come from the frozen published snapshot. Migration
  `20261041000000_public_programme_rules.sql` is **applied to the live project on 26 Oct 2026**.
  The page keeps its pairings-only view until an event is published, because `public_programme()`
  returns null unless the event is published.
- **The player's full scorecard on `/my`**: once a daily round is published, the signed-in player
  sees their own frozen card: hole, par, stroke index, gross score, handicap strokes, net score,
  gross and net Stableford points, with front-nine, back-nine and total subtotals. The card comes
  from the private publication snapshot, so it never reads the live board; the public leaderboard
  keeps its summary-only payload. Migration `20261042000000_player_scorecard_snapshot.sql` is
  **applied to the live project on 25 Oct 2026**. The live `build_round_snapshot` returned the
  existing 18-hole result with a `cards` array. No round has been published since the migration, so
  the screen shows its short note until the organizer publishes one; old publications also stay
  summary-only.


- **Scorecard corrections (issue #113).** A submitted or approved card has an **Edit** action for
  an owner or organizer. Saving writes a new revision, keeps the old revision in the record, and
  puts the new revision back in the approval queue. The correction reason is required and is
  written to `scoring_audit` by the new `record_scorecard_correction` function. The latest revision
  is the only one that can be edited. Migration
  `20261043000000_scorecard_correction.sql` is **applied to the live project on 26 Oct 2026**.

- **Mark ready override for an incomplete profile (issue #114).** A `needs_review` entry gets a
  **Mark ready** action for the owner or organizer. The dialog requires the handicap index and the
  birthdate, then records the category, tee, flight and playing handicap by hand, with a reason.
  The entry is routed into the draw with those facts, while the missing profile details stay visible
  as pending notes and the row shows an **Overridden** badge. No migration.

- **One course card, editable from Settings and Course & holes.** The same 18-hole editor now shows
  the par and stroke index for every hole, the card's total par, and a warning when a tee's stored
  par disagrees with the card. It is one component in both places, so the two screens cannot drift.
  The card belongs to the course: a saved change applies to every event on it, and changing a number
  withdraws the scorecard confirmation. A partial or invalid card is not saved over the stored one.
  No migration.

- **The handicap is visible on `Scores`**: the **Enter a card** panel shows the round's handicap
  snapshot - NGAP index, course handicap and playing handicap, with the index source and effective
  date, the tee rating/slope/par, the allowance and the arithmetic. The **Cards** table shows the
  index and playing handicap on each card, and **Net Stableford** has a PH column. The registration's
  frozen index sits beside the snapshot, with a warning when the two differ or the snapshot was
  calculated on another tee. It is display-only: corrections belong on the player record, so the
  frozen index and its audit trail are not changed from a scorecard. No migration.

### Changed
- **Player mobile quality pass**: fixed the landing navigation running together, added
  `viewport-fit=cover` and a translucent iOS status bar, added `<main>` landmarks and per-page
  titles, raised buttons and inputs to 44px (16px inputs on mobile), fixed the active tab contrast,
  versioned the service worker by build so stale pages expire, and removed autofocus from the auth
  fields. No migration.
- **Player names are shown in capitals (issue #115).** Desk lists, the draw, scores, registration,
  print, public pairings, the public leaderboard, the programme and the player portal all use the
  capitalised display name. The database keeps the spelling that was entered: a new `fullName` field
  carries the raw value back on insert or update, and the edit forms still show the original casing.
  No migration.

### Fixed
- **The control room fits a desktop viewport (issue #111).** At 1280px and wider the course map is
  exactly one viewport tall, the page does not scroll, and only the right-hand rail scrolls inside
  the map. The footer no longer adds a scrollbar. Tablet and phone keep the existing scrolling
  layout. The left rail now starts at the same height as every other desk page.
- **No hole card opens by itself on the control room (issue #111).** The first hole that needed work
  used to open over the map as soon as a draw existed. A hole now opens only after a click.
- **Draw group cards wrap instead of clipping (issue #105).** The Lock and Move controls and the
  card header wrap to a new line when the card is narrow, and the groups use one column on a phone.
  No card content is cut off at 1346px or at 390px. No migration.
## [0.26.1] - 2026-10-25

### Changed
- **Player sign-up** now links the club record by the account's display name automatically, so a
  player lands on their entry instead of a second identity form. The claim card is a fallback for an
  ambiguous or missing name and is pre-filled with the account name. Supabase email confirmation
  still controls whether a new account gets a session immediately. No migration.



## [0.26.0] - 2026-10-25

Event branding, calendar and queued email, plus the optional scorecard reader service.

### Added
- **Event host and logo** on a tournament: an optional host or sponsor name, and an optional logo
  stored in a new **private** `event-logos` bucket (2 MiB, PNG/JPEG/WebP). Club members can read a
  logo; owner and organizer can upload, replace or remove one. The desk signs a staff URL for screens
  and printing. It is not a public asset.
- **`/calendar`** in the desk shell, with month and list views. The month is a Sunday-first six-week
  grid built in UTC. Events can be created or edited from the calendar, including by clicking a day.
- **Conflict rules.** The same course, playing date and tee time on two events is refused in the
  editor, and the migration adds a database trigger for the same rule. Two events on the same course
  and day at different times are allowed and shown as a warning. A day with no start time is not
  treated as a slot. Changing an event's course is checked against its existing days too.
- **Calendar export.** `/calendar` downloads every event as one `.ics` file. Non-contiguous playing
  days become separate calendar events; an event being edited also offers an "Add to Google Calendar"
  link for its first date range.
- **Branded scorecards.** Printed scorecards carry the event logo and host name in the header. The
  print center passes the signed logo URL and prints the start format and first tee time in the
  scorecard subtitle.
- **Queued email reminders.** A new `email_outbox` holds one draft per recipient for confirmations,
  reminders or custom mail. The calendar queues drafts for registered players who have an email
  address, and shows queued, sent and failed counts. Re-queueing the same kind for the same
  registration does not duplicate a draft. Failed drafts can be moved back to queued.
- **Optional Resend delivery.** `POST /api/email/send` claims queued drafts atomically, sends up to 50
  for one event, and marks each one sent or failed after the provider answers. It needs
  **`RESEND_API_KEY` and `EMAIL_FROM`**; without them the route reports that delivery is not configured
  and the drafts stay queued. Both are listed in `.env.example`.
- **Local scorecard reader service** (`scripts/scan/`): a FastAPI `POST /scan` service that rectifies
  the card, crops the score cells and classifies them. It falls back to the printed table when the card
  edge is hidden, keeps uncertain cells null, and never approves a card. A bootstrap Roboflow model is
  connected through the hosted adapter; a local ONNX path is scaffolded. Render deployment files and
  the hosting guide are in `docs/SCORECARD_SCAN_HOSTING.md`. The service is optional: the app keeps the
  photo + manual path until `SCAN_INFERENCE_URL` is set. No migration.

### Changed
- `/tournaments` shows the event logo and host when they are set.
- The print center gives scorecards their own subtitle (dates, start format, first tee time) instead
  of reusing the start sheet's subtitle.
- A tournament now carries optional `hostName`, `logoPath` and a signed `logoUrl`. The calendar
  preserves non-contiguous playing days unless the date range is explicitly edited.
- Event branding edits use the guarded setup write, and logo completion merges only the logo fields.

### Database
- `20261040000000_event_calendar_branding.sql`: **applied to the live project on 24 Oct 2026.** Adds `tournaments.host_name`
  and `tournaments.logo_path`, the private `event-logos` bucket and its policies, the
  `tournament_days_booking_guard` and course-move triggers, a `tournaments` audit trigger and the
  `email_outbox` table with RLS. It relies on `is_club_member`, `has_club_role`, `audit_row_change`
  and `stamp_updated_at` from earlier migrations.
- No other migration ships with this work. The previous migration, `20261039000000`, is recorded as
  applied on 22 Oct 2026.


## [0.25.0] - 2026-10-24

### Added
- **Scorecard photo scan**: the Scores screen can attach a photo of a paper card, store it privately in
  Cloudflare R2, and use an optional card-reader service to propose scores with per-hole confidence.
  The desk reviews every value before submitting; no card is auto-approved. With no reader configured,
  the photo stays attached and scores are entered by hand. See `docs/SCORECARD_SCAN.md`. No migration.

## [0.24.0] - 2026-10-22

Caddie profiles, consented public player photos, admin player editing and an audit reader.

**Migration:** `20261039000000_caddies_public_photos.sql`. **Applied to the live project on 22 Oct 2026**
and recorded in `supabase_migrations.schema_migrations` as `20261039000000 / caddies_public_photos`. The
migration is additive: two player columns, the public photo bucket, the caddie tables, the guarded
membership/caddie functions and the public projections.

### Added
- **Caddie profiles**: `/caddies` lists, adds, edits and retires club caddies. A caddie is a person,
  not a login account.
- **Caddie assignment per player-day** on `/tee-times`. Assignments are anchored to
  `registration_days`, not groups, so a draw re-run cannot destroy them. One active caddie per player
  day and one active player per caddie per tournament day are enforced in the database.
- **Separate public-display photo consent**: `photo_public_consent_at` and a public
  `player-photos-public` bucket. Internal consent still governs check-in, profiles and posters. Only a
  separately consented copy reaches public pages; withdrawal removes the public copy. Existing
  internal consent is not promoted automatically.
- **Photos on the start sheet and public pairings**, and a new public `/leaderboard` page for published
  gross and net results. The public projections return only the frozen name, the published player id
  and a public-bucket path that the database has already gated on consent. Published snapshots created
  before this release have no player id, so they stay names-only until the organizer publishes again.
- **Admin player editing**: owner/organizer can correct identity, contact, NGAP/WHS ids and club
  membership from the player profile. Player delete is owner/organizer only and asks for confirmation.
- **Audit reader** at `/audit` for owner/organizer. Caddie profiles and assignments now have audit
  triggers alongside players, memberships and the existing registration/import records.
- **Photo persistence fix**: the live adapter now uploads the photo and writes `photo_path` and the
  consent timestamps. Before this, a photo chosen on the desk was session-only and vanished on reload.

### Changed
- `players.update` no longer touches photo columns; photo changes go through the guarded
  `setPhoto`, `removePhoto` and `setPhotoPublicConsent` methods.
- `build_round_snapshot` includes `playerId` in gross and net rows so the leaderboard can fetch a
  current public photo without exposing contact or handicap data.
- Project rules, the spec, the plan and the privacy policy now describe the two-consent model.

### Database
- `20261039000000_caddies_public_photos.sql` (applied and recorded 22 Oct 2026).

## [0.23.1] - 2026-10-22

### Fixed
- **Registration workbook day columns**: workbooks that mark each playing day in its own column
  (`DAY 1` … `DAY N`, or an export such as `day_1` … `day_4`) are now read correctly. A TRUE, 1 or YES
  cell selects that day; blank cells are not treated as FALSE. The event's playing-day rule is applied
  exactly as it is for a single `GAME DATES` cell, and a row that does not meet it is rejected and
  recorded with its reason instead of being guessed. No migration.
- **Verified against the real 24th Bamboo Tee workbook**: the preview read 144 rows, the commit wrote
  100 registrations and read back 200 day selections, and 44 rows with blank day assignments were
  recorded as rejected for the desk to complete.

## [0.23.0] - 2026-10-21

The scorecard workflow now writes through the guarded database functions.

### Added
- **Connected scoring repository** (`src/lib/data/supabase/scoring.ts`): reads the persisted round,
  cards, resolutions and snapshots, derives the view with the same pure engine, and writes through
  the guarded RPCs. `/scores` now uses `desk.scoring`, which is live when Supabase is configured and
  in-memory in the demo.
- **Proposed scoring defaults** (`src/lib/scoring/defaults.ts`): two independent cards, single-card
  provisional display, a proposed back-9 tie-break that stays **unconfirmed**, organizer finalization
  authority, verified-holes provisional publication, a reciprocal scorer cycle, 100% allowance, WHS
  rounding, independent days, 0.85 OCR confidence and a 1–20 stroke range. They are starting values
  stored per round, not hard-coded rules; finalization still blocks until the tie-break is confirmed.
- **Generated database types** in `src/lib/supabase/generated-types.ts`, used by the scoring adapter.
  The app’s existing hand-written types remain in place until the wider type migration is scheduled.

## [0.22.0] - 2026-10-21

Production integrity: imports that persist, the registration workbook, structured playing days, tee
times, and a clearer sign-in. The scoring engine shipped in 0.21.0.

### Added
- **Registration workbook import** (`/import`): CSV and XLSX, worksheet selection, deterministic
  column mapping, an optional schema-validated AI proposal that sees only headers and value shapes,
  a per-row preview, human approval, a single-transaction commit and an independent read-back. Member
  and guest rows become separate players; a guest does not inherit the member's birthdate, contact,
  payment or shirt.
- **Canonical player, membership and event-day model**: club-scoped `player_memberships`,
  `tournament_days`, `registration_days`, explicit registration facts, import batches and per-row
  outcomes, and an append-only audit log. Birthdate and gender are nullable so an incomplete guest
  profile is saved as Needs review instead of invented.
- **Structured public day selection**: the entry form shows each playing day's date and start time,
  sends a `days` array, and the server revalidates it against the event's required and maximum rule.
  The 24th Bamboo Tee is set to exactly two days.
- **Tee times screen** (`/tee-times`): one tab per playing day, the players who selected it, and a
  time, start hole and confirmation saved through `assign_registration_day_tee`. Day selection stays
  a separate write.
- **Sign-in diagnosis**: provider errors now distinguish an unconfirmed email from a wrong password,
  with a resend-confirmation flow and same-browser reset guidance.
- **NGAP WHS FAQ reference** (`docs/ngap/wsh-faq.md`), reproduced from the 2024 NGAP FAQ with its two
  source gaps recorded.

### Fixed
- **The handicap import reported success before any write and could not create players.** It now
  awaits a guarded transaction, refuses rows without a matching player, records each row's outcome,
  and reloads the desk from the database before showing the result. The two production batches that
  claimed 17 and 42 records are left as evidence, not treated as state.
- **Registration day and tee-time writes were not structured or checked.** They now go through
  `set_registration_days` and `assign_registration_day_tee`, with duplicate, tournament, hole-range and
  day-start validation.

### Changed
- **`/pairings` has a desktop layout.** `.public` caps every public page at 56rem, which is right for a
  phone but left the pairings page as a narrow column in the middle of a wide screen. The page now
  takes 80rem from 1024px up, with a taller header band and a larger event name, and the empty state
  is a centred dashed panel rather than a bar of text. Nothing below 1024px changes, and the class is
  scoped to the pairings container so `/my` keeps its phone-first width.

### Database
- **Applied 21 Oct 2026** to the live project: `20261037000000_player_registration_model.sql` and
  `20261038000000_public_day_selection.sql`, recorded in `supabase_migrations`.
- `20261035000000_scoring_schema.sql` and `20261036000000_scoring_workflow.sql` were applied on
  21 Oct 2026 with the scoring work (0.21.0).
- The registration migration was renumbered from `20261035000000` to `20261037000000` because the
  scoring pair already owns those two versions. Existing players, registrations, payments and
  schedules were preserved: one player and zero registrations before and after.

### Notes
- **0.20.0 and 0.21.0 were develop-only version numbers.** They were never tagged or promoted to
  `main`. `v0.22.0` is the next release after the production tag `v0.19.0`.
- The public form on production `main` is still the old form until this release is promoted. It can
  satisfy the active two-day rule only by choosing two day preferences; the new explicit picker is in
  this release.
- The draw remains a single-day board. The Tee times screen assigns per-day times; it does not generate
  a multi-day draw.
- The connected `/tee-times` click-through was not run with a staff account. The RPC, loader, build,
  unit tests and demo browser check are green.

## [0.21.0] - 2026-10-21

The scoring engine, its database, and a sample scorecard workflow.

### Added
- **Deterministic scoring engine** (`src/lib/scoring`): gross and net Stableford, the WHS Course and
  Playing Handicap pipeline, stroke allocation, card validation for webcam, upload and manual entry,
  multi-card reconciliation with desk resolutions, provisional boards and the finalization gate.
  Ninety-one unit tests. The sample workflow reads it; nothing writes to the database yet.
- **Sample scorecard workflow**: `/scores` with manual entry, card approval and rejection, conflict
  resolution, gross and net boards, provisional publication and the finalization gate. It runs on an
  in-memory repository (`src/lib/data/scoring.ts`) and is explicitly labelled as a sample.
- **Scoring schema and workflow**: 15 tables for daily rounds, per-day entries, scorer rotation,
  handicap snapshots, cards, images, extraction attempts, entries, append-only resolutions and
  canonical scores, results, immutable publications and a scoring audit; plus guarded functions for
  submission, approval, rejection, resolution, publication and finalization.
- **`public_round_results()`**, the anonymous read of the latest published results snapshot.

### Database
- **Applied 21 Oct 2026** to the live project: `20261035000000_scoring_schema.sql` and
  `20261036000000_scoring_workflow.sql`. `groups` gained `round_id`; it had zero rows, so the
  backfill changed nothing. `20261034000000_course_maps.sql` was already applied on 20 Oct.
- The live schema is ahead of `develop` until this branch merges.

### Notes
- **The main workflow path was verified on 21 Oct 2026.** A temporary `DO` block in the SQL editor
  created a disposable event and called the real RPCs: 18 verified holes, 2 approved cards, 1 desk
  resolution, 2 publications, 3 final results, 25 audit rows, and a final public snapshot with 3
  gross rows. It raised at the end, so every test row rolled back.
- Not yet covered: concurrent approvals, the image-hash idempotency path, an anonymous read of the
  published function, a 95% allowance against the engine, and the negative finalization gates.
- The `/scores` screen is a sample. It does not write to the database, and the Supabase scoring
  adapter is the next step. No OCR, connected publication or official results exist. The tie-break
  procedure is not implemented; finalization only checks that a confirmed policy exists.

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
