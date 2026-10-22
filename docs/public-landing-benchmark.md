# Public landing page benchmark

**Question:** what makes a sports site read as sport rather than travel or hospitality, and how should that be applied to TeeLine Golf's public page?

**Short answer:** the current page reads as tourism because the display face is a high-contrast serif, the hero is a soft full-bleed landscape with a slogan, the controls are pills and glass, and the hero itself contains no event data. The sports sites below do four things instead: they put a number where the slogan would go, set the display type in a condensed or heavy sans, build on hard edges and a scoreboard grid, and use one saturated accent for status and scores. TeeLine already owns the right display face (Bebas Neue) and already uses it on the player spotlight. The public page is the outlier.

**Method:** I fetched the pages and their CSS on 20 October 2026, read the `@font-face` rules where the site allowed it, and rendered screenshots of the pages named below. Font names in the table are taken from the CSS, not guessed. Some sites block automated access. Those limits are noted at the end.

**Scope:** the public marketing page only. The signed-in desk and player area are not part of this recommendation.

---

## 1. Comparison table

| Site | Display type | Hero treatment | How events are shown | How player or athlete highlights are shown |
|---|---|---|---|---|
| **NBA** (nba.com/news) | Knockout Wide, very heavy, uppercase. Roboto Condensed for tables and stats. | No marketing hero. A lead news story over a full-bleed action photo, headline below the image, dense right rail. The yellow League Pass button is the only accent. | News grid, not event cards. Scores and standings sit in the global navigation and rails. | Player names in headlines, stat tables in Roboto Condensed, no portrait cards on the news page. |
| **Premier League** | PremierLeagueW01, a custom grotesque, bold, mixed case. | Light page. A lead card with a dark photo and white headline sits beside a "Premier League Today" fixture rail. Purple is the club colour. | Fixture rail with kick-off time, crests, score and FT status. The matches section lists fixtures and results. | Top-scorer and stat tables, small square headshots, club crests. |
| **Formula 1** | Formula1 and Formula1Wide, custom condensed sans, with Titillium Web as a secondary face. Uppercase. | Near-black page, huge lead image card, carbon-fibre diagonal texture in the header, red accent. No full-screen hero. | Race cards: round number, country, date range, flag, photo. Past races add podium and times. The next race is the largest card. | Driver standings: headshot, position, team, points, oversized numbers. |
| **NFL** | All-Pro Sans, heavy, uppercase. | A scoreboard ribbon runs across the top before any hero. Blue band, lead video and story cards. | Score strip with team abbreviations, scores, quarter or FINAL. Schedule by week. | Player headlines, fantasy and stats rails, team logos rather than portrait cards. |
| **Olympics** (Paris 2024 cycle; site blocked, brand record only) | Custom Paris 2024 variable font, Art Deco geometry, tight spacing. | Full-bleed athlete photo with the Games mark and an editorial headline. White base with the Paris 2024 palette. | Day-by-day schedule by sport, with pictograms and medal events highlighted. | Medal table and athlete spotlight cards, country codes, medals in large numerals. |
| **World Athletics** | PP Formula Condensed Black and Narrow for headlines, plus a World Athletics custom face. Orange accent. | Full-bleed athlete celebration photo, headline over the image at left, white nav above. | Competition calendar and results by date, city and category. | Athlete cards with portrait, country and personal best, plus results tables. |
| **WTA** | Marsden Slim, a very condensed display face, with General Sans for body. | Green field, near-black rounded hero card, full-bleed player portrait, two giant countdown tiles. | Tournament page: a solid green field, a giant condensed "TOURNAMENT CALENDAR", status cards with LIVE / IN PROGRESS / UPCOMING badges, then the calendar list. | Player feature over a portrait, ranking and race tables, huge numerals. |
| **Riot esports** (LoL, Valorant) | Beatrice for display, Beaufort for LoL, Colfax and DIN for body. | Near-black app shell. The schedule is the first screen; there is no marketing hero on the schedule view. | Rows grouped by day: a large time, team logos, league and round, best-of. Dark cards with 1px borders. | Team logos and records. No portrait cards. |
| **Playtomic** | Inter, heavy weights, italic emphasis. | Solid indigo field, huge "Find courts and players near you", search bar, cut-out photo collage. No full-bleed photo. | Club cards with photo, name, address and "Book now". Search is by location. | Level and ranking inside the app. The landing page uses member testimonials, not athlete cards. |
| **PGA Tour** | Suisse Intl, a clean neo-grotesque. | White utility page, video player and news grid, leaderboard rail on the right. Blue accent. | Schedule page lists tournaments by week; the homepage carries the leaderboard rail. | Leaderboard rail: position, small headshot, name, country, total, today's round, "View Leaderboard" button. |
| **DP World Tour** | Geometric sans, mixed case; exact family not verified. Red score chips. | Dark navy hero, full-bleed golf photo, white headline, venue and date at left. A leaderboard panel is attached at right. | Event and ranking navigation, with Rolex Series as a named sub-brand. | Leaderboard panel over the hero: rank, name, score pill (-21), points, "See all Results". |
| **LIV Golf** | F37 Judge for uppercase headlines, Sequel Sans for body. | Full-bleed photo with a giant 3D LIV logo, dark bottom gradient, huge white condensed headline and a pill CTA. | Full-bleed crowd photo, centred "SCHEDULE", then large cards with city, dates, venue, event poster and FINISHED badge. | Team and player cards, leaderboard, top-shots video rail. |
| **USGA** | Editorial serif headline over a sans nav. Exact face not verified. | Split hero: white left column with a small overline, serif headline, red rule, body and "READ"; photo on the right. Institutional rather than scoreboard-first. | Championship hub pages with dates, venue, eligibility and entries, plus news cards. | Leaderboards and match-play brackets, player names in editorial style. |
| **The Masters** | Tiempos serif for editorial, Benton Sans for UI, Oswald for condensed labels. | Dark green field, serif Masters wordmark, understated. The tournament mark is the hero. | One annual championship hub: tee times, leaderboard, course and patron information. No schedule strip. | Leaderboard with amateur status, hole-by-hole and scorecards. Serif names and tabular scores. |
| **The R&A** | Radikal, a geometric sans, in light and regular weights. Uppercase. | Full-bleed photo of a young golfer, large light uppercase headline at left, teal pill button. Calm and institutional. | Championships list with event name, venue, dates and an "Enter" link. | Leaderboards and championship results. Less portrait-led. |
| **Texas Golf Association** (amateur and club level) | Open Sans from a WordPress theme. The hero uses a heavy wide sans. | Full-bleed course photo, centred heavy headline "Golf Gets Better Here", one line of welcome, outlined JOIN button. | Member events and championship pages, plus news cards. | Results and leaderboards linked out, champion photos, news headlines. |

Two notes on the table:

- **Golf splits into two modes.** The tour and championship sites (PGA, DP World Tour, LIV, Masters) are scoreboard-first. The governing bodies (USGA, R&A) are institution-first: serif or light sans, editorial layout, calm photography. TeeLine is a tournament product, so it belongs in the first group, not the second.
- **The strongest sports pages are not all dark.** The Premier League, PGA Tour and Playtomic are light. What makes them read as sport is the data and the type, not the background colour.

---

## 2. The pattern: four moves that make a page read as sport

### Move 1. Put a number where the slogan would go

The first screen answers "who is playing, when, and what is the score" before it answers "what is this brand".

- **DP World Tour** puts a live leaderboard panel on the hero: rank, player, score pill, points.
- **NFL** puts a score ribbon above the navigation: team, score, quarter, FINAL.
- **WTA** puts a countdown in two large green tiles: 38 MINS, 10 SECS.
- **Formula 1** puts the round number, country and date range on every race card.

The number is specific. It is not "since 1907" or "120 years of history". It is a field size, a cut-off, a first tee time, a score, a round.

### Move 2. Set the display type in a condensed or heavy sans, at poster scale

Every site in the first group uses a sans for display. The display faces are condensed or heavy, and often both: Knockout Wide, Formula1, F37 Judge, PP Formula Condensed, Marsden Slim, All-Pro Sans. The lighter sites (Premier League, PGA Tour) still use a bold grotesque, not a serif.

The type is uppercase or tightly tracked, the leading is short, and the display size is far above body size. Formula 1's page headline sits in the 44–48px range against a 16px body. LIV's schedule headline is 64px. The WTA uses 8rem (128px) for campaign numbers. The display face does the work a photograph usually does on a tourism page.

### Move 3. Build on hard edges and a scoreboard grid

Sports pages are made of rules, bands and cells, not floating cards.

- 1px borders, 0 to 4px corner radii, full-width colour bands, edge-to-edge images.
- Tables with a header row, a fixed row height and right-aligned numbers.
- Little or no drop shadow. The separation comes from a line or a background change.
- Dark surfaces are dense and flat, not glassy.

NBA, Formula 1 and Riot are the clearest examples. The Premier League is softer, but its fixture rail is still a grid of cells with times and scores.

### Move 4. Use one saturated accent for status and scores

The accent is a signal, not a mood.

- Formula 1: red `#E10600` on near-black `#1B1B20`.
- DP World Tour: red score chips on navy `#1E1450`.
- WTA: green `#00704C` and purple.
- Playtomic: indigo `#0F1C4C` with acid green.
- NFL: blue `#00277F`.

The accent is used for the live badge, the CTA, the score, the cut-off warning. It is not spread across every heading and divider.

### The supporting move: real specificity

The pages that feel most like sport name things. "Round 18, United States, 23–25 October." "Baycurrent Classic, M. Brennan, -16, R4 -3." "Eugenio Chacarra, third title of the year, Delhi GC." A club page can do the same at its own scale: event name, course, dates, field size, first tee, entry cut-off, last winner.

### Where the primary call to action sits

In the event frame, not in the navigation.

- DP World Tour: "Tournament feed" under the headline, "See all Results" inside the leaderboard panel.
- Formula 1: "Add F1 calendar" beside the calendar title, not in the top bar.
- LIV: "Read More" at the bottom of the hero, over the image.
- Playtomic: the search field is the hero, not a button in the nav.

The CTA is part of the content. A small "Sign in" in the nav is fine, but the main action belongs with the event, the date and the data.

---

## 3. What reads as tourism instead

This is the mirror image. It is also a fairly exact description of the current TeeLine landing page.

| Sports signal | Tourism signal |
|---|---|
| Condensed or heavy sans, uppercase, tight leading | High-contrast serif, mixed case, italic emphasis, wide tracking |
| Event name and data in the first screen | A slogan and a landscape in the first screen |
| 0–4px radii, 1px rules, flat bands | 18–24px radii, glass, blur, soft shadows |
| One signal accent used for status and scores | Muted gold, sage and cream used everywhere as a mood |
| Names, dates, times, field size, scores | "Discover", "Experience", "Beautifully", "Calmer" |
| One screen, one decision: enter, view pairings, check the score | One screen, one mood: scroll to explore |
| Asymmetric crops, hard edges, edge-to-edge images | Soft, even lighting, a full panorama, generous white space, slow pacing |

### The current page, specifically

From `src/app/globals.css` and `src/app/(public)/page.tsx`:

- The hero headline is **Cormorant Garamond 500 at `clamp(62px, 9vw, 116px)`**, `line-height: 0.87`, `letter-spacing: -0.045em`, with a gold `<em>` emphasis. When the headline is an event name it drops to **38–72px** (`.event-title`).
- The hero is a **full-bleed illustration** with a soft green wash, a glass note card, a photo caption and a "Scroll to explore" cue. The event strip is pulled up only 44px, so the hero stays a mood image.
- The buttons are **999px pills, 50px tall, 13px labels**.
- The event strip is a **carousel that auto-advances every 7 seconds**, so only one open event is visible at a time, and the page moves on its own.
- The event card is a **20px radius gradient panel with a 72px crest, a deep drop shadow (20px offset, 44px blur) and a serif title at 24–34px**.
- The sections use **76–132px vertical padding**, serif `h2` at `clamp(38px, 5vw, 62px)`, 13–14px body copy and thin gold hairlines.
- The copy is "Every round, beautifully organized", "Discover TeeLine", "A calmer way to run tournament day".

None of those choices is wrong on its own. Together they describe a resort brand. A visitor learns how the page feels before they learn what they can enter.

### The recognition test

Open the page at 1440px and answer these in five seconds:

1. What is the next event?
2. When is it?
3. How many places are left?
4. What does it cost, or where do I enter?
5. Who won the last one?

If the page cannot answer three of those without scrolling, it is still in tourism mode.

---

## 4. Recommendation for TeeLine's landing page

**Direction:** build the page like a tournament poster bolted to a scoreboard. Keep the forest and ivory brand, keep the existing fonts, remove the serif and the glass, and put the event and the data in the first screen.

All names, dates, scores and counts in this section are layout examples, not IGCC data. Use the real values or omit the field. Do not ship a placeholder score or a sample event on the live site.

### 4.1 Typeface: use Bebas Neue, and do not add a font

**Display: Bebas Neue.** It is already bundled through `@fontsource/bebas-neue`, already declared as `--f-condensed`, and already used on the player spotlight at 84px and 980px. It is the only condensed uppercase face in the project. That is exactly the sports idiom: Formula 1, LIV, World Athletics, the WTA and the NFL all use a condensed or heavy uppercase display face.

**Supporting heading: Manrope 800.** Use it for event names that need lowercase and for section headings that would be unreadable in all caps. Manrope is variable, so 800 is already available. It gives the "bold sans" weight that Bebas cannot, because Bebas has one weight.

**Body and data: Geist.** Keep it at 400/500/600/700. Use `font-variant-numeric: tabular-nums` and `font-feature-settings: "tnum" 1, "lnum" 1` for dates, scores, counts and times. Geist is the neutral text face; it should not be the display face.

**Retire Cormorant Garamond from the public page only.** Keep it in the signed-in desk and player area. The serif is the single strongest tourism signal on the landing page. Removing it does more for the redesign than any other change.

**Do not add a face for this redesign.** The four bundled fonts cover the job:

- Bebas is the condensed uppercase display.
- Manrope is the heavy display sans with lowercase and a full weight range.
- Geist is the neutral text and data face; it carries the tabular numerals.
- Cormorant is the serif, and it is the problem.

If a future campaign needs a lowercase condensed face with several weights, add a variable grotesque with a width axis, such as **Archivo Variable**, in one bundled file. Do not add it now. Bebas plus Manrope 800 is enough, and another face adds weight and another thing to keep consistent.

**Scope the change to the landing page.** Do not change the global `--f-display` or `--f-serif` tokens, because the desk uses them. Put the landing rules under the existing `.teeline-site` / `.teeline-hero` scope, or a new `data-landing` scope.

#### Type scale

| Role | Face | Desktop | Mobile | Weight | Case and tracking | Colour |
|---|---|---|---|---|---|---|
| Hero event name | Bebas Neue | `clamp(64px, 9.5vw, 136px)` | `clamp(52px, 14vw, 76px)` | 400 | Uppercase, `0.005em`, line-height `0.84` | `#FFFDF7` |
| Hero date | Geist | 18px | 14px | 700 | Uppercase, `0.06em`, tabular | `#E3B85A` |
| Hero meta | Geist | 15px / 24px | 13px / 20px | 400 | Sentence case | `#C5D3CA` |
| Hero body | Geist | 16px / 26px | 15px / 24px | 400 | Sentence case, max 46ch | `#D7E2DA` |
| Primary button | Geist | 13px | 12px | 700 | Uppercase, `0.08em` | `#14201A` on `#E3B85A` |
| Data value | Geist | 30px | 24px | 700 | Tabular | `#F7F5EE` |
| Data label | Geist | 10px | 10px | 600 | Uppercase, `0.12em` | `#AFC2B7` |
| Section label | Geist | 11px | 10px | 600 | Uppercase, `0.16em` | `#E3B85A` on dark, `#755719` on light |
| Section heading | Bebas Neue | `clamp(44px, 5.5vw, 72px)` | `clamp(36px, 10vw, 48px)` | 400 | Uppercase, `0.005em`, line-height `0.9` | `#202522` or `#F7F5EE` |
| Event card name | Bebas Neue | 34px | 28px | 400 | Uppercase, `0.005em`, line-height `0.92` | `#FFFDF7` |
| Event card meta | Geist | 13px / 20px | 12px / 18px | 400 | Sentence case | `#C5D3CA` |
| Leaderboard player | Geist | 16px | 15px | 600 | Sentence case | `#F7F5EE` |
| Leaderboard score | Geist | 22px | 20px | 700 | Tabular | `#FF8A7A` under par, `#F7F5EE` even or over |
| Body copy | Geist | 16px / 26px | 15px / 24px | 400 | Sentence case, max 64ch | `#626B64` on ivory |
| Small print | Geist | 12px / 18px | 11px / 16px | 400 | Sentence case | `#626B64` |

Rules for the type:

- `#FFFDF7` is the display white already used in the hero; `#F7F5EE` is the page ivory. Do not mix them within one text block.
- Bebas below 24px is hard to read. Use Geist or Manrope below that size.
- Do not use Bebas for buttons, body copy, labels or long event names that need lowercase.
- Do not use Manrope 800 in all caps at large sizes. Use sentence case or title case; Bebas owns the caps.
- Use one italic in the whole page at most, and not in the hero. The current gold `<em>` is the tourism tell.

### 4.2 The hero

**Composition:** a full-bleed course image or treated course artwork, a forest scrim from the left, the event lockup at left, and a four-cell data strip across the bottom. The nav is a solid forest bar, not a transparent overlay.

```
┌──────────────────────────────────────────────────────────────┐
│ TEELINE      SCHEDULE   PAIRINGS   THE CLUB       [ ENTER ]  │ 64px forest bar
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ■ OPEN FOR ENTRY                                            │
│                                                              │
│  PRESIDENT'S                                                 │
│  CUP 2026                  full-bleed course image           │
│                                                              │
│  24–26 OCTOBER 2026                                          │
│  36 holes · stroke play · first tee 07:00                    │
│  Entry closes 17 October. Field limited to 120.              │
│                                                              │
│  [ ENTER THIS EVENT → ]   [ VIEW PAIRINGS ]                  │
│                                                              │
├───────────────┬───────────────┬───────────────┬──────────────┤
│ 84 / 120      │ 03D 14H 22M   │ 36            │ 07:00        │
│ ENTRIES       │ TO CUT-OFF    │ HOLES         │ FIRST TEE    │
└───────────────┴───────────────┴───────────────┴──────────────┘
```

**Specification:**

- **Height:** `min-height: 680px` on desktop, `620px` on mobile. Not `min(900px, 100svh)`. The current hero is at least 720px tall and often a full screen before any event data.
- **Nav:** solid `#073D2E`, 64px tall, 1px bottom border `rgba(247,245,238,.18)`. Links 12px Geist 600 uppercase, `0.08em`. Logo 180px wide. "Enter" button 40px tall, 4px radius, gold background, dark text. On mobile: logo and Enter only.
- **Image:** the existing course artwork, treated as a high-contrast duotone poster, or a course photograph with no identifiable people if the owner confirms it is allowed. Crop tight on a green, bunker or treeline; do not show the whole panorama. The landing page should not show player faces. The project rule is two-consent: internal consent covers desk use, and a separate public-display consent covers player photos on pairings, the leaderboard and printed start sheets. If neither asset is allowed, use a solid forest field with a single 1px contour line, not a soft landscape.
- **Image treatment:** `object-position: 62% 38%`, `filter: saturate(.75) contrast(1.12) brightness(.82)`. No parallax. A one-time 1.02 scale on load, 500ms, then stop.
- **Scrim:** `linear-gradient(90deg, rgba(7,24,18,.94) 0%, rgba(7,24,18,.74) 42%, rgba(7,24,18,.18) 72%, rgba(7,24,18,.5) 100%)` plus `linear-gradient(0deg, rgba(7,24,18,.92) 0%, transparent 34%)` for the data strip. The scrim is directional, not an even wash.
- **Status line:** a 6px square plus "OPEN FOR ENTRY" in Geist 700 11px uppercase `0.14em`, gold. States: OPEN, CLOSES IN 3 DAYS (red), FIELD FULL (muted), NEXT EVENT (gold). No glowing dot unless something is actually live.
- **Headline:** Bebas, event name, 136px desktop, 76px mobile, line-height `0.84`, max-width 900px. If the name is longer than about 24 characters, drop to 104px desktop and allow three lines.
- **Date line:** "24–26 OCTOBER 2026" in Geist 700 18px, gold, tabular.
- **Meta line:** "36 holes · stroke play · first tee 07:00" in Geist 400 15px, muted.
- **Body:** one practical sentence, not a slogan. "Entry closes 17 October. Field limited to 120." 16px/26px, max 46ch.
- **Buttons:** 52px tall, 4px radius. Primary: gold `#E3B85A`, dark text, "ENTER THIS EVENT →". Secondary: transparent, 1px `rgba(247,245,238,.45)`, ivory text, "VIEW PAIRINGS". No pills.
- **Data strip:** four equal cells, 96px tall, 1px top border `rgba(247,245,238,.24)`, 1px vertical dividers. Values 30px Geist 700 tabular. Labels 10px Geist 600 uppercase. This replaces the glass note card, the artwork caption and the scroll cue.

**When there is no open event:** headline "THE 2026 SEASON", date line the next event date, body "The next event opens for entry on 1 November." Data strip: NEXT EVENT, ENTRIES OPEN, FIELD, FIRST TEE. Do not show sample events on the live site.

**Remove from the hero:** the serif, the gold `<em>` emphasis, the line-plus-eyebrow, the glass note card, the "Illustrative course artwork" caption, "Scroll to explore", the pill buttons, the parallax.

### 4.3 The open events strip

The current carousel is overbuilt for one or two events. It is also carefully built for keyboard and reduced motion; keep that care, but remove the auto-advance and the single-card view. Replace it with a static strip that changes layout by count.

- **1 event:** one full-width card, three columns: date block 180px, body 1fr, action 200px.
- **2–3 events:** a 3-column grid with 1px gaps and 1px borders, no shadows.
- **More than 3:** a horizontal scroll strip with snap, 320px cards. No dots, no arrows.

**Placement:** directly under the hero, no negative margin, no overlap. Full-width band `#0B2B23`, 1px top border `#2A4539`, 64px vertical padding.

**Header row:** "OPEN FOR ENTRY" in Geist 600 11px uppercase `0.16em`, gold, with a 24px gold rule to the left. On the right: "Season →" in 12px Geist 600.

**Card anatomy:**

- **Date block:** month "OCT" in 11px Geist 700 uppercase `0.12em`, gold; day "24" in Bebas 64px, ivory; year "2026" in 11px Geist 500, muted. A 1px vertical rule separates it from the body.
- **Status:** "OPEN" in 10px Geist 700 uppercase `0.12em`, gold; "CLOSES IN 3 DAYS" in `#FF8A7A`; "FIELD FULL" in `#8FA096`.
- **Event name:** Bebas 34px uppercase, line-height `0.92`, max two lines, ivory.
- **Venue:** Geist 13px, "IGCC · Sta. Barbara, Iloilo".
- **Format:** Geist 13px, "36 holes · stroke play · 07:00 first tee".
- **Entry count:** "84 / 120" in Geist 700 14px tabular, with a 2px progress bar. Track `rgba(247,245,238,.16)`, fill gold.
- **Action:** "ENTER →" in Geist 700 12px uppercase `0.08em`, gold. The whole card is a link.

**Example card:**

```
OCT        OPEN                                   84 / 120
24         PRESIDENT'S CUP 2026                   ████████░░
2026       IGCC · Sta. Barbara, Iloilo
           36 holes · stroke play · 07:00 first tee
           ENTER →
```

**Rules:**

- No 20px radius. Use 4px at most.
- No drop shadow. Use 1px borders and background changes.
- No 72px crest. If the club crest is used, 32px maximum and only on the featured card.
- No carousel dots for one event.
- No auto-advance. Every open event is visible at once. If there are more than three, the visitor scrolls; the page does not move on its own.
- No "from ₱X" if the price is not real.
- Hover: background `#12382C`, CTA arrow moves 2px, 160ms.

**Mobile:** date block 64px, event name 28px, format hidden, CTA becomes a full-width 44px row. Cards stack vertically with 1px gaps.

### 4.4 Player and schedule highlights

TeeLine has no media team and cannot use player photos on the public page. That is an advantage: golf's own leaderboard idiom is text and numbers, and it is the strongest sports signal available.

#### A. Last result leaderboard

Place it after the open events. Full-width forest band `#073D2E`, 72px vertical padding.

- **Header left:** "LAST RESULT" in 11px Geist 600 uppercase, gold. H2 "PRESIDENT'S CUP 2026" in Bebas 64px, ivory. Below it "Final · 26 October 2026" in 13px Geist 400, muted.
- **Header right:** "Full leaderboard →" in 12px Geist 600, gold.
- **Table:** header row 10px Geist 600 uppercase `0.12em`, muted. Five rows. Row height 56px. 1px bottom border `rgba(247,245,238,.14)`.
- **Columns:** POS 56px, PLAYER 1fr, CLUB 180px, R1 56px, R2 56px, TOTAL 80px, right-aligned. Use only the rounds the event actually has; do not invent an R2 for a one-round event.
- **Position:** Geist 700 16px tabular. The winner gets a 3px gold left border and a "WINNER" badge in 9px gold.
- **Player:** Geist 600 16px, ivory. No photo on the landing page. Public pairings and the leaderboard may use a photographed player only with the separate public-display consent; elsewhere use initials in a 32px square with a 1px border.
- **Score:** Geist 700 22px tabular. Under par `#FF8A7A`; even or over `#F7F5EE`. Do not use red on a light background for small text; use `#C8352B` if the table is on ivory.
- **Mobile:** POS, PLAYER, TOTAL only. Hide club and rounds.
- **Empty state:** "No result published yet. First event: 24–26 October." Do not invent scores.

**Example row:**

```
1   M. SANTOS        IGCC      68  70  -6
2   J. DELA CRUZ     IGCC      71  69  -4
3   A. REYES         IGCC      70  72  -2
```

#### B. Season schedule

Place it after the leaderboard, on ivory.

- **Header:** "THE SEASON" in Bebas 64px, ink. Right: "Add to calendar" in 12px Geist 600, `#755719`.
- **Month group:** "OCTOBER 2026" in 11px Geist 600 uppercase `0.14em`, muted, with a 1px bottom rule `#E2E4DC`.
- **Rows:** 64px tall, 1px bottom rule. Date "24–26" in Geist 600 14px tabular, 48px column. Event name in Manrope 800 20px, sentence case. Venue in Geist 13px, muted. Status badge right: OPEN, CLOSES SOON, CLOSED, RESULT. Arrow at the far right.
- **Hover:** background `#EFEEE7`. No cards, no photos, no shadows.
- **Mobile:** date 48px, name 17px, venue hidden, status under the name.
- **One event only:** skip the season schedule. The hero and the open event card already carry the date. Do not build a one-row table to fill the section.

**Example row:**

```
24–26   President's Cup 2026            IGCC · Sta. Barbara        OPEN →
```

#### C. What the desk does

Keep the three capabilities, but restyle them as a hard grid, not cards:

- Three columns, 1px top rule, 32px gaps.
- A Bebas numeral 01/02/03 at 64px in gold at the top of each column.
- Title in Manrope 800 18px, sentence case.
- Body in Geist 13px/20px, muted.
- One text link per column, 12px Geist 600, `#285D47`.
- No icons, or 20px line icons at most. No contour-line SVG behind the section.

#### D. Page order

1. Nav
2. Hero with data strip
3. Open events strip
4. Last result leaderboard
5. Season schedule
6. What the desk does
7. How it works (three steps, big Bebas numerals)
8. Pairings band
9. Footer with photo or artwork credit

This order puts the sport first and the product second. The current order puts the mood first and the product third.

**How it works:** keep the three steps, but set the numerals in Bebas 72px gold, the titles in Manrope 800 18px, and the body in Geist 13px, separated by 1px rules. Remove the contour-line SVG. It is landscape decoration, and it is the same tourism signal as the hero illustration.

### 4.5 Colour and contrast

Keep the brand, but make the accent do a job.

| Token | Value | Use |
|---|---|---|
| Forest | `#073D2E` | Nav, dark bands, hero base |
| Deep forest | `#0B2B23` | Event strip, footer, card surfaces on dark |
| Ivory | `#F7F5EE` | Page background, text on forest |
| Flag gold | `#E3B85A` | Primary CTA, status, rules, progress fill |
| Gold ink | `#755719` | Small gold text on ivory |
| Score red (dark) | `#FF8A7A` | Under-par scores and cut-off warnings on forest |
| Score red (light) | `#C8352B` | Under-par scores on ivory |
| Muted on dark | `#C5D3CA` | Secondary text on forest |
| Muted on light | `#626B64` | Body copy on ivory |

`#E3B85A` is a landing-page accent, not a replacement for the app's `--gold` (`#B89550`). It is the same hue with more chroma so it can carry a CTA on a dark photo. The desk keeps its current gold. If the club prefers to keep `#B89550`, use it for rules and large numerals and use ivory for the primary button; do not use the muted gold for small text on ivory.

Measured contrast:

- Ivory on forest: 11.2:1.
- Gold `#E3B85A` on forest: 6.6:1.
- Gold `#E3B85A` on ivory: 1.7:1. Use only for rules and large non-text marks. For small text on ivory, use `#755719` (6.1:1).
- `#FF8A7A` on deep forest: 6.6:1.
- `#C8352B` on ivory: 4.8:1.
- `#D64533` on forest is only 2.8:1. Do not use it for text there.

Rules:

- One accent per screen. Gold is the action and status colour; red is the warning and under-par colour. Do not use both in the same row unless the row is a score with a cut-off warning.
- No gradients except the hero scrim. No glass, no blur, no soft shadow.
- If a surface needs separation, use a 1px line or a background change.
- The page can be light. The PGA Tour and Premier League are light and still read as sport. Dark bands are for the hero, the event strip and the leaderboard, not the whole page.

### 4.6 Motion

Use motion for data, not atmosphere.

- Countdown: one client component, updates every minute. Static server value on first paint, then hydrate. Do not animate every second.
- Status: a 160ms colour change when a card becomes urgent.
- Hover: 160ms background change and a 2px arrow shift.
- Entry: a 500ms fade and 8px rise on the hero text, once. No scroll-linked parallax.
- Respect `prefers-reduced-motion`.

The current hero parallax (`hero-parallax`, `animation-timeline: scroll()`) is an atmosphere effect. Remove it. The countdown and the leaderboard are the motion the page needs.

### 4.7 The single example to copy

**Copy the DP World Tour's attachment of data to the event, not its navy or its Rolex clock.**

On the DP World Tour home page, the hero is one frame: a golf photograph, the event name in large white type, the venue and dates at the left, and a leaderboard panel at the right with rank, player, score and a link to the full results. The panel is not a separate "results section" further down the page. It is part of the event.

That is the move TeeLine should copy. Put the event and its numbers in the same frame:

- In the hero, the bottom data strip carries entries, cut-off, holes and first tee.
- Immediately below the hero, the last result's top five carries the player names and scores.
- The open event card carries the field size and the progress bar.

The visitor should never have to choose between reading about the event and checking the data. They are the same object.

Do not copy the DP World Tour's scale: a global schedule, a Rolex clock, a "My Tour" membership band, sponsor inventory. Copy the composition, not the inventory.

### If you change only three things

1. Replace the serif hero and the slogan with Bebas, the event name, the date and the four-cell data strip.
2. Replace the auto-advancing carousel with a static open-events strip that shows every open event at once.
3. Add the text leaderboard from the last result, with names, scores and a link to the full result.

Those three changes remove most of the tourism signal without touching the signed-in app.

---

## 5. What not to copy

- **A global calendar.** Formula 1, LIV and the DP World Tour need a calendar because they run a season across many countries. TeeLine has one or two events at one club. A carousel with one card looks broken. Build one featured event and one next event.
- **A 24/7 newsroom and autoplay video.** NBA, NFL and World Athletics can fill a page because they have a media team. A club page with three stale news cards looks abandoned. If there is no writer, do not build a news rail.
- **Fake live badges and invented scores.** The project rule is never guess data. A "LIVE" badge when nothing is live, or a sample leaderboard on the production site, destroys trust. Use NEXT EVENT, OPEN, CLOSED, RESULT.
- **Heritage mode.** The Masters and the R&A can use serif type, light weights, a cinematic splash and calm photography because they are century-old institutions with one flagship event. A club page needs the entry date, the field size and the pairings link. Do not hide them behind a teaser.
- **Marketplace search.** Playtomic is a directory of clubs and courts. TeeLine is one club. Do not add "Find a club near you" or a location search.
- **Sponsor walls, ticket tiers and hospitality modules.** Formula 1 and the DP World Tour are media and hospitality businesses. A club tournament page needs entry, pairings and results, not a partner strip.
- **Decorative effects and an all-dark shell.** LIV, Formula 1 and Riot can afford 3D type, dotted halftone, carbon fibre, custom cursors, scroll-jacking and a near-black page. These date quickly, cost performance, and put a golf page in the wrong light. Golf is played outdoors in daylight. Use dark bands, not a dark page.
- **Four countdowns.** The WTA can count down to a global finals. TeeLine needs one countdown: the entry cut-off. More than one turns a scoreboard into a gimmick.

---

## 6. Sources

All pages accessed 20 October 2026.

### General sport

- NBA: <https://www.nba.com/news> (home blocked automated access; the news page was used). CSS families: Knockout Wide, Roboto Condensed, Action NBA Cond Web.
- Premier League: <https://www.premierleague.com/en> and <https://www.premierleague.com/en/matches/premier-league/2026-27>. CSS family: PremierLeagueW01.
- Formula 1: <https://www.formula1.com/en> and <https://www.formula1.com/en/racing/2026>. Font stylesheet: <https://www.formula1.com/s/fonts.css>. Families: Formula1, Formula1Wide, Titillium Web.
- NFL: <https://www.nfl.com/>. CSS family: All-Pro Sans.
- Olympics: <https://www.olympics.com/en/> (blocked automated access). Paris 2024 typeface record: <https://www.typeroom.eu/paris-2024-olympics-sustainable-design-neo-deco-custom-variable-typeface-visual-sports-identity> and <https://www.theolympicdesign.com/olympic-games/typefaces/paris-2024/>.
- World Athletics: <https://worldathletics.org/>. Font files: PP Formula Condensed Black and Narrow, World Athletics Headline.
- WTA: <https://www.wtatennis.com/>. CSS families: Marsden Slim, General Sans.
- Riot esports: <https://lolesports.com/> and <https://valorantesports.com/>. Font files: Beatrice, Beaufort for LoL, Colfax, DIN Next.
- Playtomic: <https://playtomic.io/>. CSS family: Inter.

### Golf

- PGA Tour: <https://www.pgatour.com/> and <https://www.pgatour.com/schedule>. CSS family: Suisse Intl.
- DP World Tour: <https://www.europeantour.com/dpworld-tour/>. Viewed as a rendered screenshot. Direct HTML blocked.
- LIV Golf: <https://www.livgolf.com/> and <https://www.livgolf.com/schedule>. CSS families: F37 Judge, Sequel Sans.
- USGA: <https://www.usga.org/>. Viewed as a rendered screenshot. CSS blocked.
- The Masters: <https://www.masters.com/>. CSS families: Tiempos, Benton Sans, Oswald. Main stylesheet: <https://www.masters.com/assets/style/main.3490f56a.css>.
- The R&A: <https://www.randa.org/>. CSS family: Radikal.
- Texas Golf Association: <https://www.txga.org/>. CSS family: Open Sans.

### TeeLine code read for this note

- `src/app/globals.css`: type tokens `--f-sans`, `--f-display`, `--f-serif`, `--f-condensed`; hero and strip styles at lines 1649–2135; section styles at lines 2144–2394.
- `src/app/layout.tsx`: `@fontsource-variable/geist`, `@fontsource-variable/manrope`, `@fontsource/cormorant-garamond/500.css`, `@fontsource/cormorant-garamond/600.css`, `@fontsource/bebas-neue`.
- `src/app/(public)/page.tsx`: hero, carousel, capability, workflow and pairings sections.
- `src/components/spotlight/PlayerSpotlight.tsx`: existing use of Bebas at 84px and 980px, Manrope 800 for the surname, forest and gold palette. The public page should borrow this language.

### Limits

- NBA home, ATP, Olympics, USGA and DP World Tour direct HTML blocked automated access. The NBA row uses the news page; tennis uses the WTA; DP World Tour and USGA were judged from rendered screenshots. USGA and Olympics typefaces are visual or brand-record claims, not CSS-verified.
- The screenshots are not committed. This file is the deliverable.
- The recommendation uses no new font and no new dependency. Bebas Neue is already imported in `layout.tsx`.
