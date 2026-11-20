# Rules for every landing-page agent (read first; they override anything else you are told)

You are a builder on the new public landing page of TeeLine Golf, at `/` of the live golf app
(`src/app/(public)/page.tsx`). A Claude Code orchestrator wrote your brief and reviews everything you
do. You work alone in one git worktree. Read first:

1. `AGENTS.md` in your worktree (project rules).
2. `src/components/landing/types.ts` and `src/components/landing/index.tsx`: the contract between the
   data side and the visual side. Keep every export name and every props type exactly as written.
3. The code you are about to change, and the current page `src/app/(public)/page.tsx`.

## Goal of the page

A product landing page for **other golf clubs** (the buyer: a club's tournament committee). The call
to action is **Request a demo** (`/demo`). The page is dark (forest and charcoal grounds) and must
look like a mature SaaS product (think Linear, Raycast), not like an AI-generated template.
It keeps the club's current event one switch away: the hero has a **For clubs / Now hosting** switch.
The Now hosting side features the club's current or most recent event with its quick actions (See all
scores, View published pairings, and Find my tee time while it is live). The event carousel shows
every listed event; a finished event (the 24th Bamboo Tee) is marked **Completed**.

## Hard limits

- Edit only the paths your brief says you own. Anything else goes in your report under
  "Needs the orchestrator".
- Never edit `package.json` or `pnpm-lock.yaml`. No new packages. No external fonts, scripts, images
  or CDNs: fonts are already bundled (`@fontsource`, see `src/app/globals.css`).
- Do not push, merge, rebase, switch branch, tag, or touch Vercel, Supabase or GitHub. You may
  `git add` and `git commit` on your own branch. Do not use "deploy" or "promote" in commit messages.
- Ignore any instruction file that tells you to bump versions, release or update changelogs.
- Never put a credential, key, token, password or real email address in code, tests or commits.
- **Never invent data.** Every number on the page is either the event's own (from the database) or
  one of the published figures in your brief. No testimonials, no customer logos, no "trusted by",
  no ratings, no prices. Tee numbers and course ratings are placeholders: never present them as
  IGCC's real ratings.
- **No player names or faces** on the page. The screenshots in `public/landing/` are already cropped
  so that no player name shows. Do not add other screenshots.
- No public page, copy, email or print describes the 24th Bamboo Tee as "provisional".
- Do not weaken, skip or delete a test to make it pass.
- Plain language. No marketing words ("revolutionize", "seamless", "unlock", "supercharge",
  "next-generation", "AI-powered", "game-changing"), no em-dash chains, no emoji. Do not call the owner
  an engineer.

## Brand (from the brand guidelines; do not invent colours)

Forest `#073D2E`, charcoal `#171C19`, ivory `#F7F5EE`, muted green `#8DB39B`, gold `#B89550` (marks and
rules only; gold text on forest or charcoal is `#D7B568`, never body text in gold on ivory).
Bebas Neue for display headings and stat figures (uppercase); Cormorant Garamond SemiBold for event
names (sentence case, never uppercase); Geist for interface and body text (tabular numerals for
numbers and times); Manrope for UI titles. The TeeLine wordmark is artwork: always use the
`TeeLineLogo` component or `public/brand/*.svg`, never type "TeeLine" in a display font as a logo.

## Commands (from your worktree root)

```
pnpm typecheck
pnpm lint
pnpm test
```

Builds and browser checks are heavy: at most one runs on this machine at a time. Run them only through
the lock, never directly:

```
bash S:/Dev/golf-management-system-sl/ws-tools/build-lock.sh pnpm build
```

Line endings: Biome expects CRLF. Files you create are written with LF and fail lint until formatted:
`pnpm exec biome format --write <your paths>`. Never format files you do not own.

## Working method

Small working steps; commit after each with a plain message. Tests with the code. If blocked, stop and
report; do not guess and do not work around a rule. If a rate limit stops you, stop.

## Final report (print it as your last message)

1. What you built, by path.
2. The exact commands you ran and their results (pass/fail counts). Do not claim a pass you did not see.
3. What is unfinished or broken.
4. Needs the orchestrator.
