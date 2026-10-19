# Mobile benchmark: what golf and club apps put in the bottom bar

Research for issue #60, 19 Oct 2026.

The question was how real golf and sports-club apps handle mobile before TeeLine designs a bottom
bar. I read store listings, vendor help docs and app screenshots. Where an app's bar is not
documented or visible, the table says so instead of guessing. Screenshots are from the store
listings linked in the sources.

## The short version

- **Golf Genius, one of the biggest tournament platforms, has no bottom bar on its event app.**
  It uses a six-item home menu. That is the most useful and most inconvenient finding here.
- Where a bar exists it holds **3 to 5 items**, and the middle item is often an action rather than a
  destination: GHIN's Play button, Royal Selangor's plus.
- The club apps keep a **catch-all**: More, Menu or Account. The largest bar in this sample has
  five items.
- **None of the apps I checked documents an offline mode for tournament data.** Live data is the
  norm, not offline data. Offline is a design choice TeeLine can make, not a market requirement it
  is failing.
- **A PWA is not a downgrade in this market.** HowDidiDo's Android app is a GoNative (now Median)
  webview build, and foreUP's is a vendor-built branded app. Native is common, but so is wrapping a
  website.

## 1. Comparison

| App (market) | Platform | Navigation, exact where visible | Offline behaviour |
| --- | --- | --- | --- |
| **USGA GHIN** (US) | Native iOS and Android | **5:** Home · Golfers · **Play** (centre, raised) · Stats · Account | No offline mode documented; posting and GPS are online features |
| **Golf Genius event app** (global) | Store app, iOS and Android | **No bottom bar documented.** Home menu of six: Enter Scores, Leaderboard, Upload Photo, Scorecards, Tee Sheets, Member Portal | No offline mode documented; built around live leaderboards |
| **Golf Genius Club App** (UK, Qatar) | Store app, same app | **5-item menu bar:** Home · Events · Results · Profile · Transactions, customisable per club | No offline mode documented |
| **HowDidiDo** (UK, Ireland) | Android is a GoNative/Median webview (`io.gonative.android.nyazo`); iOS app also listed | Top icons and a hamburger; no bottom bar in the store screenshots | Web app; no offline mode |
| **Club Caddie** (US) | Store app, custom per club | **4:** Home · Range Finder · Score Card · Menu | No offline mode documented; rangefinder needs maps |
| **foreUP Branded** (US) | Store app, vendor-built (App Store copyright Innovatise) | Brand-configurable home; no fixed bar | Booking and member app; no offline |
| **Chronogolf** (Canada, US) | Store app, iOS and Android | Booking home and "my bookings"; no persistent bar in the store screenshots | No offline mode |
| **Golaman / PGRR** (Philippines) | Android store app, 79 courses at launch | Booking-first. Club page uses in-page tabs: Tee Time · Golf Info · User Rating. No tournament navigation | No offline mode |
| **KLGCC**, Albatrozz (Malaysia) | Native iOS, Android, Huawei (vendor states native) | **3:** Home · Notifications · Profile (icons only) | Not documented |
| **Royal Selangor GC**, Albatrozz (Malaysia) | Native iOS, Android, Huawei (vendor states native) | **5:** Home · Bookings · **+** (centre) · Menu · Profile (icons only) | Not documented |
| **Playtomic** (Europe, global padel) | Store app, iOS and Android | Global bar not documented publicly. Club screen uses top tabs: Home · Book · Open matches · Competitions | Booking needs a connection |
| **TeeLine today** (Philippines) | Next.js web app, no PWA | **11-item rail**, collapsed to a hamburger sheet below 1024px (`AppShell.tsx`) | None |

"Store app" means a downloadable iOS or Android build. I did not verify whether its interface is
native or a webview unless the row says so. Where a bar is described as icons only, the labels are
read from the icons. Store screenshots can lag the shipped build, so treat the exact order as
indicative rather than a specification.

## 2. The pattern

**The bar is for places you return to, not things you do once.** That is why it stays at four or
five. The apps that appear to have "everything" in the bar have not put everything there. They have
put the four or five rooms a person walks between, and a catch-all.

**Home does the work.** Golf Genius puts six actions on the home screen. Club Caddie puts six
booking and membership tiles there, then keeps four tabs. KLGCC has only three tabs and puts Golf,
Range, Sports, Events, Dining, Wellness, Happenings and Members Privileges on the home screen. The
home screen is the quick-action surface. The bar is the map.

**Four destinations plus one action is the common shape.** GHIN: four destinations and a raised
Play button in the middle. Royal Selangor: Home, Bookings, plus, Menu, Profile. The action is
visually different because it is not a place. Tapping it starts something and returns you to where
you were.

**The catch-all is normal.** Club Caddie calls its fourth tab Menu. Royal Selangor uses a hamburger
inside the bar. A visible "More" is easier to find with a thumb than a small gear in the header, and
easier to label.

**Labels are short nouns.** Home, Golfers, Stats, Account, Events, Results, Profile, Bookings, Menu.
Not "View your tournament pairings". One word where possible, two at most.

**Badges mean work waiting, not activity.** Club apps put notifications in the header or on home.
TeeLine's existing rail already badges review, registration attention and blocking draw issues. Keep
that discipline in the bar: a badge should mean "someone has to do something", never "something
happened".

**The bar is role-specific.** Member apps show members member things. Staff tools live in a
separate admin app or area. A bar that mixes both produces dead ends: a player taps Draw and meets
a sign-in wall.

**Search is not a tab.** GHIN's Golfers tab is a directory, and the search field sits at the top of
the screens where it is used. A search field belongs there, not in the bar.

### Quick action versus full screen

A quick action is one decision, done in a sheet or one screen, returning the person to the context
they came from. Check in a player. Add a walk-up. Withdraw a player. Call the pro shop. These
should not require navigating away from the group you are standing at.

A full screen is for browsing, comparing or editing many fields. The draw board, the import merge
queue, tournament settings, print preparation. These are not quick actions even when they are
frequent. They need room.

The split in the apps above is consistent: quick actions live on home or behind a raised centre
button; full screens are tabs, or live behind More.

## 3. Recommendation for TeeLine

The current phone experience is an eleven-item rail collapsed into a hamburger sheet
(`src/components/AppShell.tsx`). That is a desktop navigation folded up, not a mobile one. Replace
it below 1024px with two role-aware bottom bars. Keep the rail on desktop.

### The desk bar (owner, organizer, desk)

Five items, four destinations and one action:

1. **Today** (home). The event-day screen: what needs attention, what is blocking publish, which
   wave is next. Reason: the first question on the course is "what needs me now", not "which
   tournament".
2. **Draw**. The live board by hole and group, with the group card and player names. Reason: this
   is the screen the organizer actually walks the course with.
3. **Desk** (centre, raised, opens an action sheet). Check in, Add walk-up, Withdraw. Reason: these
   are the three things that happen on the course, and none of them deserves a permanent tab.
4. **Players**. Searchable directory with index, category, status and eligibility. Reason: almost
   every conversation on the course starts with a name.
5. **More**. Tournaments, Handicap imports, Print center, Course and holes, Clubhouse display,
   Settings, Player view, Sign out. Reason: everything used before the event or at a desk, not
   while walking.

### The player bar

Three items:

1. **My golf**. The player's own entry, published start, flight, tee and playing handicap
   (`/my` already renders exactly this). Reason: it is the one thing a player opens the app for.
2. **Pairings**. The full published list with name search (`/pairings`). Reason: check who you are
   playing with and at what time.
3. **Account**. Sign in, claim the member record, sign out. Reason: low frequency but necessary,
   and nothing else earns a fourth slot.

Do not give players the staff bar. Players are not `club_members`; the RLS model already keeps them
out. A bar that offers Draw or Players to a player is a row of locked doors.

### Which items are quick actions

Only **Desk** in the staff bar. It opens a sheet, does one thing, and returns to the screen behind
it. Today, Draw, Players, My golf and Pairings are destinations, not actions. Do not turn Draw into
a "quick action": moving a player is a deliberate edit with a reason and an audit trail, not a
one-tap gesture on a phone.

### What should not be in the bar

- **Print center.** It is a desk job with A4 output. On a phone it is a preview, not a task. Put it
  in More and keep it usable on a tablet or laptop.
- **Settings / event setup.** Used before the event, and a mis-tap can change a rule that moves
  every player. Keep it behind More and behind the manager role.
- **Handicap imports.** A file upload, column mapping and a merge review need a large screen and
  careful comparison. It is the worst possible thumb target.

Also leave out: Clubhouse display (a television, not a phone), Account on the staff bar (sign-out
only), and a Notifications tab. There is no notification centre yet (plan gap 11, decision 14), so
a bell tab would be an empty room. Keep the existing bell shortcut to blocking draw issues until
that decision is made.

### Behaviour details worth getting right

- 56px minimum row height, safe-area padding at the bottom, labels always visible. The club's
  members are not all 25; an icon-only bar asks them to learn five symbols.
- One badge rule: Today shows the count of items needing action, Desk shows nothing. Do not badge
  three tabs at once or the badges stop meaning anything.
- Active state uses the existing gold token. The bar sits on the surface colour, not the forest
  band, so it does not fight the header.
- The bar must not cover the last row of a list. Add bottom padding to `main` equal to the bar
  height plus the safe area.
- Drive it from the existing `nav` array with a `mobile` flag and a role filter, not a second
  hard-coded list. The desktop rail and the phone bar should not drift.

## 4. On offline

A tournament desk holds about a hundred names, handicap indexes, categories and tee times. That is
a tiny payload. Caching it is not a storage problem. It is a privacy and freshness problem, and
both are more serious than the storage.

The published snapshot is deliberately narrow: names, flight, hole and time, no indexes
(`public.public_pairings`, `src/lib/data/public.ts`). If the phone caches the full field with
indexes and categories, it puts data on a device that the public page is not allowed to show. On a
club-owned phone that is an operational risk. On a player's own phone it crosses the boundary the
product already drew. The cache must keep the same allow-list as the page, not a wider one.

Stale data is worse than no data. A cached draw after a withdrawal sends a player to the wrong
hole. A cached start time after a rain delay is a complaint at the starter. Any offline view must
be read-only, must show the published version and time, and must say plainly that it is offline.
A spinner is honest. A silent stale list is not.

**What I would do.** Cache the app shell, the current published pairings snapshot, and the
signed-in player's own entry. Show the version and "last updated" stamp that `/pairings` already
renders. Clear or replace the cache when a new version is published. Never cache the live draft
board. Never queue writes.

**What I would refuse.** Caching player contact details, birthdates, payment status or photos.
Caching the working draw. Any offline check-in or offline draw edit with a sync queue. Two devices
checking in the same player, or two organizers moving the same group on the course, is a
reconciliation problem the club does not need on event day.

**What would make it worth doing.** Measure first. Walk the course with a phone on the network the
club actually uses and record where it drops. If there is signal at the first tee, the tenth and
the clubhouse, skip offline caching and spend the effort on the bar, speed and install. If there
are real dead spots, build the narrow version above: a service worker with versioned caches, a
small JSON payload from the existing public pairings function, a cache version tied to publish,
and tests for the offline, empty and stale states. That is a contained piece of work. It is not a
platform.

## 5. Installability

TeeLine is a web app. The honest options are:

1. **PWA.** Add a web app manifest, icons and a service worker over HTTPS. Android shows an install
   prompt; iOS installs through Share, then Add to Home Screen. On iOS, web push works only for
   apps added to the Home Screen, and only from iOS 16.4. Safari can clear script-writable storage
   after seven days without interaction in a browser tab, but a Home Screen web app keeps its own
   usage counter, so an installed app is the safer place for a cache.
2. **Native.** Two codebases, store review, an Apple developer account and a Google Play account,
   for a club running one event at a time. Not justified now.

Recommendation: PWA first. Be precise with the owner about the phrase "native bottom nav bar". It
means a bar that looks and behaves like the platform's own, with safe-area handling, a raised
centre action and no browser chrome in the way. That can be built in the PWA. It does not require a
native binary.

Revisit native only if a second club signs, or if push notifications become part of the event
workflow. Neither is true today.

## 6. Suggested scope for issue #60

Split it into three pieces, in this order:

1. **Mobile bottom bar.** Role-aware desk bar and player bar, replacing the hamburger sheet below
   1024px. This is the owner's actual request and the smallest useful change.
2. **Installability.** Manifest, icons, theme colour, service worker with an offline fallback page.
   No data caching yet.
3. **Offline published snapshot.** Only if the course walk shows dead spots. Read-only, versioned,
   same allow-list as the public page.

Do not bundle offline writes into this issue. That is a different problem with a different risk
profile.

## Sources

All links read on 19 Oct 2026.

**GHIN**

- App Store listing and screenshots: https://apps.apple.com/us/app/ghin-handicap-index-gps/id491796218
- Google Play listing: https://play.google.com/store/apps/details?id=com.advancedmobile.android.ghin

**Golf Genius**

- Player instructions, home menu: https://docs.golfgenius.com/en/articles/10777412-using-the-golf-genius-apps-player-instruction
- Club App instructions, five-item menu bar: https://docs.golfgenius.com/en/articles/10777384-club-app-instructions-for-players
- Google Play listing: https://play.google.com/store/apps/details?id=com.golftripgenius.android.leaguegenius

**HowDidiDo**

- Google Play listing, package `io.gonative.android.nyazo`: https://play.google.com/store/apps/details?id=io.gonative.android.nyazo
- GoNative, now Median, webview app platform: https://gonative.io/

**Club Caddie**

- Mobile app functionality, tabs and home tiles: https://support.clubcaddie.com/general-mobile-app-functionality

**foreUP**

- Branded app description: https://www.foreupgolf.com/branded-mobile-app/
- App Store listing, copyright Innovatise: https://apps.apple.com/us/app/foreup-golf-club/id6746114577

**Chronogolf**

- Google Play listing: https://play.google.com/store/apps/details?id=com.chronogolf.booking.chronogolf

**Philippines and Southeast Asia**

- Golaman on Google Play: https://play.google.com/store/apps/details?id=com.golaman.app
- Philstar launch report, 79 courses: https://www.philstar.com/about-us/sports/2026/08/08/2547894/first-ever-golf-booking-app-launched-philippines
- PGRR platform description, NGAP partnership and prepayment: http://pgrbooking.com/
- Albatrozz member apps, clients and platforms: https://www.albatrozz.com/mobile-app
- KLGCC home screen, three-item bar: https://www.albatrozz.com/app-images/KLGCC/Home.png
- Royal Selangor home screen, five-item bar: https://www.albatrozz.com/app-images/RSGC/Home.png

**Outside golf**

- Playtomic club booking tabs: https://playerhelp.playtomic.com/hc/en-gb/articles/19831715222929-How-to-book-a-court-or-a-spot-in-a-match-in-your-favourite-Club
- Playtomic App Store listing: https://apps.apple.com/us/app/playtomic-play-padel/id1242321076

**Installability and offline**

- Chrome install criteria: https://web.dev/articles/install-criteria
- Web Push for Home Screen web apps on iOS 16.4: https://webkit.org/blog/13966/webkit-features-in-safari-16-4/
- Safari seven-day storage cap and the Home Screen exception: https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- Service worker caching patterns: https://web.dev/articles/offline-cookbook
