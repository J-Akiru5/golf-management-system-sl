# Tagalog and Hiligaynon: review checklist

The player pages speak English, Tagalog and Hiligaynon. English is the source of truth and was
written for the club; **Tagalog and Hiligaynon are first drafts** and must be read by a native
speaker before the first real event. Nothing in the app claims they are checked.

## How to read this

- One file per language: `src/lib/i18n/dictionaries/en.ts` (source), `tl.ts`, `hil.ts`. Every key
  must exist in all three; the tests fail if one is missing, empty, or loses a `{placeholder}`.
- A change is safe to make in one file alone as long as the keys stay the same. If a key needs a new
  placeholder, add it to all three.
- Golf terms stay in English on purpose: flight, tee, handicap, hole, shotgun, pairing, NGAP. That is
  how the club speaks them. If a term reads badly, change the sentence around it and tell Jeff, but
  do not invent a new word for a golf term.
- Dates and times keep the Philippine English format (`12 Nov 2026`, `7:00 AM`) in all languages.
  Hiligaynon and Tagalog have no locale data in the browser, so inventing month names would make
  them up rather than translate them.

## Where the words show up

| Surface | File | What to check |
| --- | --- | --- |
| Player header, "My golf" page | `(player)/layout.tsx`, `(player)/my/page.tsx` | Is the tone the club would use with a member? Is "Link your club record" clear about why it is asked? |
| Entry card facts | `player.fact.*`, `player.value.*`, `player.status.*`, `player.payment.*`, `player.start.*` | Do the labels read like the club's own sheet? Is the start line ("Hole 10A · 7:00 AM") natural? |
| Pairings page | `pairings.*` | "Find your name", the all-flights filter, the version line, "names, flight, hole and time only" |
| Entry form shell | `enter.*` | The closed-entries notice and the deadline line |
| Claim messages | `player.claim.*` | The refusals ("more than one member record matches") must be clear and calm, never blaming |
| Errors | `player.error.*` | A session ending, the player area not being switched on |

## Review steps

1. Open the language picker in the player header (or set a `desk-lang` cookie to `tl` or `hil`) and
   walk the player pages: `/my`, `/pairings`, and an entry link.
2. Read the copy out loud. Anything that sounds like a literal translation should be reworded
   naturally, even if it drifts from the English.
3. Mark anything wrong on this page with the key name (for example `player.claim.ambiguous`) and the
   suggested wording. Jeff or the next agent applies it to the dictionary file.
4. When a language has been read end to end, note it here with the date and the reviewer's name, and
   the plan's decision 18 can be closed.

## What has been reviewed

| Language | Reviewed by | Date | Notes |
| --- | --- | --- | --- |
| English | Written for the club, 18 Oct 2026 | 18 Oct 2026 | Source of truth |
| Tagalog | Not yet | - | Draft by an agent; needs a native reader |
| Hiligaynon | Not yet | - | Draft by an agent; needs a native reader |

## Not covered yet

- The desk (organizer) screens are English only for now; decision 17 covers whether that changes.
- The public entry form's own field labels (`src/components/public/RegistrationForm.tsx`) are not
  translated yet: the page shell around it is. That is the next piece of player-facing copy.
- Nothing is translated in the database: event names, custom questions and player names are whatever
  the club typed.
