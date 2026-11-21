# Brief: TEEO UI (a friendlier chat panel, Pakoy's layout in TeeLine's colours)

Branch `teeo/ui`, from `feat/teeo-byok`. Common rules attached (they say "public pages"; this is the
public chat). A structure builder is changing `src/lib/ai/**`, `apps/ops/**` and `supabase/**` at the
same time; do not touch them.

## The owner's words

"The UI of Teeo, make it more friendly. Use the layout like this from Pakoy." Pakoy is the PakaonAI
assistant: a coloured header band with the mascot in a round badge, the name in bold and a one-line
tagline, a close button; a calm body with rounded message bubbles and the mascot's avatar beside its
messages; a row of **quick-reply chips** above the input; a **pill-shaped input** with a **round send
button** (paper-plane icon). Teeo today has a full-width "Language" row, a square textarea and a
grey "Send" box, which feels like a form, not a friend.

## You own

`src/components/chat/**` (markup, classes, `chat.css`, small presentational helpers) and the copy
strings in `src/lib/chat/copy.ts` (add, do not remove). Do **not** change the conversation state, the
fetch/stream handling, storage, validation or submit code in `ChatPanel.tsx`; move markup around it.

## Build

1. **Header band**: forest gradient (`#073d2e` to `#0d2b20`), Teeo's head (`TeeoAvatar variant="head"`)
   in a 48 px ivory ring, "Teeo" in 18 px semibold ivory, a tagline under it in muted ivory
   ("Your tournament concern buddy." and its Tagalog, Hiligaynon and Cebuano versions in `copy.ts`),
   a round close button on the right. The **language picker moves into the header** as a small pill
   (a globe icon and the short code: EN, TL, HIL, CEB) that opens a native `select` (keep it a real
   labelled control for accessibility). Remove the full-width Language row.
2. **Body**: soft ivory ground (`#f7f5ee` to `#f1efe7`) for warmth and senior-friendly contrast.
   Teeo's bubbles are white with a hairline border and a soft shadow, 18 px radius, 16 px text, the
   28 px head avatar beside the first bubble of each run. The player's bubbles are forest
   (`#073d2e`) with ivory text, right aligned. A typing indicator (three dots, opacity animation only)
   while Teeo is answering. The summary card and the sent/fallback states keep their content and get
   the same friendly card look (the fallback's "Use the form instead" becomes a clear button).
3. **Quick-reply chips** above the composer, Pakoy style (rounded, outlined, wrap to two lines):
   "My name is misspelled", "A score looks wrong", "Question about my tee time", "Handicap question"
   in the chosen language (add the four to `copy.ts` for en, tl, hil, ceb). Tapping one sends its text
   as the player's message through the existing send function. Show them until the player has sent
   their first message; after that hide them.
4. **Composer**: a pill input (full rounded, light border, 48 px tall, grows to 3 lines), the
   placeholder "Tell Teeo your concern…" (localised), and a round 44 px send button with a paper-plane
   icon (`lucide-react` `SendHorizontal` or `Send`), forest with an ivory icon, disabled state muted.
   Enter sends, Shift+Enter makes a new line (keep whatever the current code does for this if it
   already exists).
5. **Launcher**: keep the head-only bubble and the "Ask Teeo" label; give it a soft gold ring and a
   gentle 2 s bob on first load only (transform only, skipped under reduced motion).
6. **Phone**: the panel becomes a bottom sheet that fills most of the screen, above the bottom bar,
   with the input never hidden by the keyboard (use `dvh` units).

## Acceptance

`pnpm typecheck`, `pnpm lint`, `pnpm test` pass (update chat render tests for the new markup; never
weaken a behaviour assertion). No new packages. Final report as in the common rules.
