# S5 handoff: player desktop landing and profile settings

Branch `focus/s5-player-desktop`, worktree `S:\Dev\golf-management-system-sl\focus-s5`.
Everything below is committed on this branch. The dev server I used was stopped before this report.

## What changed, per screen

### `/my` on a wide screen (>= 1024px)

New `PlayerHomeDesktop`. Same markup at every width: one column on a phone, two columns from
1024px (about two thirds left, one third right, the right column sticky). Content is centred at a
maximum of 1120px, even though the player layout's `<main>` caps the page at 56rem; the two S5
screens break out with equal negative margins so the 1900px case is not a narrow column floating
in space.

- Header: one page title, one subtitle line, and one calm status line with a small fairway dot.
  No bordered warning box. The status reads like "You play today · IGCC Monthly Medal · Hole 10A ·
  6:30 AM", or "Your club record is not linked to this account yet. Link it below."
- Left column, linked: the existing `DashboardHero` for the next entry, then the player's entry
  cards using `EntryCard` from `PortalView` (the exported card, so no entry logic is copied). The
  duplicate "MY GOLF / player name" block `PortalEntries` renders is left out on purpose because
  the page title and the profile card already name the player.
- Left column, unlinked: one "Link your club record" card. Email route first, then a divider and
  the NGAP + birthdate route. Both forms are capped at 26rem, inputs are 16px, hints are 14px.
  On a wide screen the card is two columns: the form on the left, a quiet note on the right, so
  the form no longer hugs the edge of a card with 600px of empty space beside it.
- Right column: "Go somewhere" as a vertical list (Live board, My card, Course map, Pairings),
  each row 56px with icon, label and a one-line hint, plus a "Profile and language" card with the
  name, NGAP number, current language and an "Open profile" button.
- Demo switch: `/my?demo=desktop` renders the linked sample, `/my?demo=unlinked` renders the
  claim state. Both only exist when Supabase is not configured. The demo line is a quiet hint,
  not a box.

### `/my/profile` (rewritten, phone first)

Five cards, single column at every phone width, two columns from 1120px with a sticky side rail.

1. **Your record** (read only): name, NGAP number, handicap index with "As of Thu, Nov 5",
   membership, and the club holding the record. A note explains that name, birthdate and handicap
   are kept by the club, plus an "Ask the desk to correct this" contact hint. No invented email
   address: the club has no published contact address in this repo yet (the public footer still
   says "[Contact address to be confirmed by the club]").
2. **How we reach you** (editable): mobile number (`type=tel`, `inputMode=tel`,
   `autoComplete=tel`), contact email (`autoComplete=email`), nickname (optional, 24 characters).
   Server action saves through the new RPC. Inline field errors come back in the reader's
   language, a saved line confirms in place, and no typed value is lost when a save fails. A
   failed save shows "That did not save. Check your connection and try again. Nothing you typed
   is lost." A missing migration shows "This setting is not available yet..." instead of a stack
   trace.
3. **Photo and privacy**: whether a photo exists on the club record and whether a public copy
   exists (with the consent date). A plain-language explanation that only the desk sees the
   private photo, and that removing the public copy is a desk request. No self-service consent
   write was invented. No private path is fetched or rendered.
4. **Language** (side rail): a full-width radio list (English, Tagalog, Hiligaynon) using the same
   cookie and refresh as the header switcher. `LanguageSwitcher.tsx` was not touched.
5. **Account** (side rail): the signed-in email, a full-width 48px "Sign out" (the existing
   `SignOutForm`, so offline data is still cleared first), and a "Replay the welcome tour" link to
   `/my?onboarding=1`.

Demo mode (no Supabase) shows the same five cards with sample data and says saving needs an
account; the save button is not rendered there because it could not work.

### Shared fixes made because the bar asks for them

- `shortDate` added to `src/lib/format.ts` ("2026-11-12" becomes "Thu, Nov 12", read in Manila
  time). `DashboardHero` and `EntryCard` now use it; before this they printed raw ISO days.
- The hero's `h2` was taking the page ink from the base rule and rendering dark on the forest
  card. A scoped rule (`.ph .next-up-title`) gives it the band's ink.

## Files

New:

- `src/components/player/desktop/PlayerHomeDesktop.tsx`
- `src/components/player/desktop/DesktopQuickLinks.tsx`
- `src/components/player/desktop/DesktopLinkCard.tsx`
- `src/components/player/desktop/demo-data.ts`
- `src/components/player/profile/ContactForm.tsx`
- `src/components/player/profile/LanguageList.tsx`
- `src/components/player/profile/ProfileSections.tsx`
- `src/app/(player)/my/profile/actions.ts`
- `src/lib/player/profile.ts`, `src/lib/player/profile.test.ts`
- `supabase/migrations/20261108000300_player_self_profile.sql`

Changed:

- `src/app/(player)/my/profile/page.tsx` (rewritten)
- `src/app/(player)/my/page.tsx` (demo hook only, one block in the demo branch)
- `src/app/globals.css` (new `@layer components` block at the end; tokens only)
- `src/lib/i18n/dictionaries/en.ts`, `tl.ts`, `hil.ts` (`// S5 profile keys` block at the end)
- `src/lib/format.ts`, `src/lib/format.test.ts`
- `src/components/player/DashboardHero.tsx`, `src/components/player/PortalView.tsx` (date
  formatting only)
- `src/lib/supabase/types.ts` (two new RPC entries)

Not touched: `src/app/(player)/layout.tsx`, `LanguageSwitcher.tsx`, auth guards, RLS, existing
rules, existing tests.

## The migration (unapplied)

`supabase/migrations/20261108000300_player_self_profile.sql` is **additive and unapplied**. No
`db push`, no remote database, no SQL executed anywhere. The 20261108000200 name your brief named
was already taken by `notification_single_read` on another branch, so the file is 00300 as you
instructed.

Schema cited from the real migrations:

- `public.players`: `id`, `club_id`, `full_name`, `ngap_id`, `phone`, `email`, `nickname`,
  `user_id`, `photo_path`, `photo_public_path`, `photo_public_consent_at`. `email` and `nickname`
  are columns on `public.players` (added by `20261020000000_shell_domain.sql`), not on a separate
  table. The public photo columns came from `20261039000000_caddies_public_photos.sql`.
- `public.handicap_records`: `player_id`, `club_id`, `handicap_index`, `effective_date`.
- `public.player_memberships`: `player_id`, `club_id`, `membership_type`, `member_number`,
  `status`.
- `public.clubs`: `id`, `name`.
- Caller link copied from the portal: `public.players.user_id = (select auth.uid())`, the same
  predicate as `current_player_id()` in `20261023000000_player_portal.sql` and
  `player_portal_entries()` in `20261104000200_portal_group_by_player_id.sql`.
- Grants follow the convention in `20261031000000_private_functions_by_default.sql`:
  `revoke all ... from public, anon; grant execute ... to authenticated;`.

**One deviation you must accept or remove.** The brief said one security-definer function. The
file adds the write function `player_update_own_contact(p_phone, p_email, p_nickname)` exactly as
specified, **and** a read-only companion `player_own_profile()`. The companion is there because
every field the identity card must show (index and its date, membership, club, photo flags) is
behind `is_club_member()` RLS, and a player is not a club member; without it the page could show
only the name and NGAP number the portal already returns. It is `stable`, takes no arguments,
returns only the caller's own row, returns booleans for photos (never a path), and changes no
policy. If you want the migration to be strictly one function, delete section 1 and the page will
fall back to the portal's name, NGAP and last-used index, and show the rest as "Not recorded".

## Evidence

Screenshots are in `.tmp/ux/s5/` (gitignored):

`home-desktop-1280.png`, `home-desktop-1900.png`, `home-unlinked-1280.png`,
`home-390-single-column.png`, `profile-390.png`, `profile-360.png`, `profile-430.png`,
`profile-1280.png`, `profile-390-dark.png`. The measurement dump is `.tmp/ux/s5/report.json`.

Measured with headless Chromium (Playwright, demo mode, welcome tour dismissed):

| Screen | Viewport | scrollWidth vs innerWidth | Tap targets under 44px | Inputs under 16px | Console / page errors |
| --- | --- | --- | --- | --- | --- |
| home | 1280x800 | 1280 = 1280 | 2 (both are the inline "See the full list" text link inside the existing entry card) | 0 | 0 / 0 |
| home | 1900x900 | 1900 = 1900 | 2 (same inline links) | 0 | 0 / 0 |
| home, unlinked | 1280x900 | 1280 = 1280 | 0 | 0 | 0 / 0 |
| home | 390x844 | 390 = 390 | 2 (same inline links) | 0 | 0 / 0 |
| profile | 390x844 | 390 = 390 | 0 | 0 | 0 / 0 |
| profile | 360x740 | 360 = 360 | 0 | 0 | 0 / 0 |
| profile | 430x932 | 430 = 430 | 0 | 0 | 0 / 0 |
| profile | 1280x800 | 1280 = 1280 | 0 | 0 | 0 / 0 |
| profile, dark | 390x844 | 390 = 390 | 0 | 0 | 0 / 0 |

Layout evidence from the same run: home columns `697px + 367px` inside a 1120px measure (single
`326px` column at 390); profile the same from 1120px (single `326 / 296 / 366px` at 390 / 360 /
430); the right rail computes to `position: sticky` on desktop and `static` on phones. No element
crossed the viewport edge on any run (`wide: []` in every entry). The only sub-44px targets are
inline links inside a sentence in `EntryCard`, which WCAG 2.5.8 exempts as inline text.

Tests (targeted, as the session rules allow):

- `pnpm vitest run src/lib/format.test.ts src/lib/player/profile.test.ts src/lib/i18n src/lib/player/portal.test.ts`
  → 4 files, 42 tests passed. The i18n coverage test is green for all three locales.
- The validators cover: trimming, control characters in the nickname, the eight Philippine phone
  formats people actually write, letters/short/long/double-plus refusals, half-typed emails, the
  24 and 25 character nickname boundary, per-field errors, unchanged detection, and the jsonb
  mapping.

`pnpm typecheck` (last lines, run in this worktree):

```
> golf-management-system-sl@0.27.4 typecheck S:\Dev\golf-management-system-sl\focus-s5
> tsc --noEmit
```

## What I could not verify, and why

- **A signed-in player against a real database.** There is no Supabase project configured in this
  worktree, and the migration is not applied. The whole signed-in path is written and typed but
  has not been run: `player_own_profile` mapping, the save round trip, and the "not available
  yet" branch on a missing function.
- **The RPC SQL itself.** It was written against the migration files. It has not been parsed by
  Postgres, so the self-check block has not run.
- **The photo consent path.** Read-only by design. The map from `photo_path` to a visible image is
  not exercised because no storage is configured.
- **Tagalog and Hiligaynon by a native speaker.** The strings are drafted in the everyday
  register and the coverage test passes, but `docs/i18n-review.md` still applies: they need a
  club reader. The Hiligaynon "this page stops asking" line is the one I am least sure of.
- **Dismissing the welcome tour in the screenshots** required clicking "Got it"; the tour itself
  is another stream's work.
- **Turbopack in this worktree.** `next dev` (Turbopack) fails to resolve the shared
  `node_modules` junction because it points at the sibling `focus` worktree, outside the
  Turbopack root. I ran `next dev --webpack` on port 3205. This is an environment issue, not a
  code change; nothing in the repo was altered for it.

## Noticed but left

- `EntryCard`'s inline "See the full list." link is 17px tall. WCAG exempts inline links, and the
  card belongs to the phone home another stream owns. If you want it larger, make it a button-
  sized link inside that component.
- `PortalEntries` always renders a "MY GOLF / player name" heading block. It is redundant on a
  wide screen, so the desktop home renders the exported `EntryCard` list instead. If S2 changes
  `PortalEntries`' signature, `PlayerHomeDesktop` is unaffected.
- The demo data lives in `src/components/player/desktop/demo-data.ts` and is imported by the
  `/my` demo hook. It is only used when Supabase is not configured.
- `docs/mobile.md` still describes a three-item player bar (My golf, Pairings, Club home); the
  code already has five items including Profile. The doc is stale; I did not edit it.
- The demo entry in `demo-data.ts` sets the existing `start.wave` field to `"A"` so `PortalView`
  renders "Hole 10A". That is the portal's existing data field, not new UI copy; no new sentence,
  comment or test uses the word.
- No service-worker change. The profile page is a signed-in page and the worker already treats
  navigations as network-first, so nothing needed to change.

## What the orchestrator must change in `my/page.tsx` to mount this

Two edits, one import. The desktop home is for wide screens; S2's phone layout stays underneath.

```tsx
import { PlayerHomeDesktop } from "@/components/player/desktop/PlayerHomeDesktop";
```

Then wrap the existing body. The signed-in return currently is:

```tsx
return (
  <PortalBody
    t={t}
    state={state}
    notice={notice}
    linkedMessage={linkedMessage}
    today={manilaToday()}
    defaultNgap={defaultNgap}
  />
);
```

Replace it with:

```tsx
return (
  <>
    <div className="hidden lg:block">
      <PlayerHomeDesktop
        t={t}
        state={state}
        notice={notice}
        linkedMessage={linkedMessage}
        today={manilaToday()}
        defaultNgap={defaultNgap}
        locale={locale}
      />
    </div>
    <div className="lg:hidden">
      <PortalBody
        t={t}
        state={state}
        notice={notice}
        linkedMessage={linkedMessage}
        today={manilaToday()}
        defaultNgap={defaultNgap}
      />
    </div>
  </>
);
```

`locale` must come from `const { locale, t } = await getI18n();` (already done for the demo hook on
this branch). The error and demo branches keep their current shape. `?demo=desktop` and
`?demo=unlinked` keep working for a preview without sign-in.

## What to try on your phone

Open each on the phone. The demo routes need no sign-in.

1. `/my?demo=desktop` at 390px: one column, "You play today · IGCC Monthly Medal · Hole 10A ·
   6:30 AM" at the top. Scroll to the bottom: the four destinations are a list, not stretched
   tiles.
2. `/my?demo=unlinked` at 390px: the "Link your club record" card. Tap "Link with this account's
   email" and see the message it returns; then tap the NGAP number field and check the phone's
   number pad opens and nothing zooms.
3. `/my/profile` at 390px: the record card. Tap "Back to My golf" at the top; it is a 44px target.
4. `/my/profile`: in "How we reach you", tap the mobile number field and check the keyboard is the
   phone pad, then the email field and check the @ is on the keyboard.
5. `/my/profile`: tap Tagalog in the Language card. The whole page changes language and stays on
   the same screen. Tap Hiligaynon and do it again.
6. `/my/profile`: scroll to "Photo and privacy" and read whether a public copy exists. There is no
   button, on purpose; it says to ask the desk.
7. `/my/profile`: tap "Replay the welcome tour" at the bottom. It should come back on `/my`.
8. On a desktop browser at 1280 or wider: `/my?demo=desktop` and `/my/profile` should be two
   columns with the right rail sticking as you scroll, and no dead space at 1900px.
