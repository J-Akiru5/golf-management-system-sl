/**
 * privacy copy. DRAFT: not reviewed by the club or its legal adviser.
 *
 * Generated from docs/legal by scripts/gen-legal.mjs. Edit the markdown and regenerate; do not
 * edit this file by hand, or the next run will overwrite it.
 */
export const privacyMarkdown = `> **DRAFT — not reviewed by the club or its legal adviser. Do not publish as legal advice.**

# Privacy Policy (draft)

**TeeLine Golf at Iloilo Golf and Country Club**
Version 1.0, draft. 20 October 2026.

This policy explains how Iloilo Golf and Country Club ("the Club") handles personal data in TeeLine Golf ("the software"). TeeLine Golf is built and maintained by Syntaxure Labs ("Syntaxure"). The policy is written for players, club staff, and visitors to the public pages.

It describes what the software actually holds and shows. It does not replace the Club's own event rules or the advice of its legal adviser.

## 1. Who is responsible

The Club is the personal information controller for the player, entry, handicap, photo, and staff account data described here. The Club decides what is collected, why it is held, and who may see it.

Syntaxure Labs develops and maintains the software for the Club. Syntaxure does not run the tournament, decide entries, set handicaps, or take payments.

Privacy contact: \`[TO BE CONFIRMED BY THE CLUB: the name, role, email address, and postal address of the Club's data protection officer or privacy contact]\`.

If you are a player, start with the Club for access, correction, erasure, or a complaint about your data. If the question is about how the software itself works, the Club can pass it to Syntaxure.

## 2. What the software collects

### Player and entry records

- Your name, in the form you give it. The record can also hold separate first and last names and a nickname.
- Your birthdate. It is used to work out your age on tournament day and to place you in the right age category.
- Your gender, recorded as male or female. It is used for the category you enter.
- Your home course, mobile number, and email address, when you give them.
- Your NGAP number, when you give it.
- Your handicap history: the index, the date it took effect, whether it came from an NGAP import or a manual correction, and the import file it came from.
- Your entries: the event, your status (ok, ineligible, or needs review), the reasons for that status, the index frozen at the cut-off, the category, tee, flight, playing handicap, payment status (not recorded yet, recorded as paid, or waived), and the answers you gave on the form.
- The answers can include whether you are a member or a guest, the sponsor question, shirt size, tee-time preferences, a declared WSH ID, a declared handicap, and any extra questions the Club adds to the event.
- The staff account that registered the entry, where a staff member did it, and the account that last changed it, with the times. A database trigger stamps these from the signed-in account, so a client cannot set them. A public entry starts without a staff account; the desk account that reviews it is recorded when it changes.
- A flag showing that staff changed the category, tee, or flight by hand.
- Import review records: names, NGAP numbers, handicap indexes, and effective dates from an NGAP file that could not be matched automatically, kept for the desk to review.

### Photos

- A photo, only when you have given consent. The player record can store the file path and the date and time consent was recorded.
- Where a photo file is stored, it is kept in a private storage bucket, not in the player table.

### Staff accounts

- Your sign-in email, display name, and role: owner, organizer, or desk. Passwords are handled by Supabase Auth and are not stored in the tournament tables.
- Records of entries you registered or last changed, versions you published, import batches you created, and alerts you have read. These are audit and workflow records.

### Technical data

- The app's own tables do not store IP addresses, device identifiers, advertising IDs, or location data.
- The hosting providers may keep standard access logs. Their retention is outside the app. \`[TO BE CONFIRMED BY THE CLUB: the hosting providers' log retention and whether the Club receives those logs]\`.
- The app has no analytics, advertising, or tracking scripts. Fonts and other assets are bundled. The public pages do not call external font or script services.

## 3. What is public

### The published pairings page

\`/pairings\` is open to anyone. It does not need a login. When the Club publishes a draw, the page shows:

- the event name, date, start format, and first tee time;
- the published version number and the time it was published;
- for each group: the group number, wave when the event uses waves, starting hole, tee time, and flight name;
- the name of each player in the group.

For a player, the only player data on the page is the name, flight, hole, and tee time. The page does not show contact details, birthdate, handicap index, playing handicap, category, payment status, photo, or staff account. It also does not show the gender field, home course, or NGAP number.

A flight name can itself say "Ladies", "Senior", or "Super Senior". That is the Club's label for the flight, and it is public as part of the flight name.

Before the Club publishes, the page may show the nearest event's name, date, start format, and first tee time with an empty state. It does not show player names or group details until a draw is published.

The page can be printed, and it may be indexed by search engines. Treat a published name as public.

### The landing page

The home page lists events that are open for entry. It shows the event name, dates, start format, first tee time, entry cut-off, and the number of confirmed entries. It does not show player names. The count is a number, not a list.

### The entry form

The public entry form shows the Club's instructions, shirt sizes, tee-time options, extra questions, and payment instructions. Payment instructions may include a bank name, account name, and account number. The Club types that text. The software does not verify it.

The answers you submit are sent to the Club. They are not published.

### What is never public

- mobile number and email address;
- birthdate;
- the gender field;
- home course;
- NGAP number;
- handicap index and playing handicap;
- category;
- payment status;
- photo;
- the staff account that handled the entry.

The public pairings page does show player names. If the Club unpublishes a draw, the page is hidden, but the published version is kept in the Club's version history. That history still contains the names that were published. See section 7.

## 4. Who can see the rest

### Club staff

The Club creates staff accounts. A staff account has one of three roles:

- **Owner.** Can read the Club's records, change event settings, publish or unpublish the draw, and manage staff accounts.
- **Organizer.** Can read the Club's records, change event settings, publish or unpublish the draw, and manage staff accounts.
- **Desk.** Can read the Club's records, register players, and edit entries.

All three roles can read the Club's player, entry, and handicap records. The app's write screens follow the role list above. The Club's database rules are the final control.

### Players

A signed-in player sees only their own record and entries in \`/my\`. That page shows your name, NGAP number, each event, your entry status and reasons, your frozen index, playing handicap, category, tee, flight, payment status, and your published start. It does not show your birthdate, contact details, email, or photo. It does not show another player's contact details, birthdate, email, photo, or handicap.

An account on its own shows nothing. You link a player record by entering your full name or NGAP number. The match must be unique and the record must not already be linked. If the match is ambiguous or the record is already linked, the page refuses and asks you to contact the Club.

This link is a convenience, not proof of identity. The match is based on the name or NGAP number you enter, not on an email, birthdate, or club card. The Club may ask you to confirm your identity before it treats a claim as verified.

### Service providers

The Club's database, sign-in, and photo storage are hosted by Supabase. The app is hosted by Vercel. These providers process data for the Club. They do not decide how the tournament is run.

\`[TO BE CONFIRMED BY THE CLUB: the written data processing terms with Syntaxure Labs, Supabase, and Vercel, and the current hosting locations]\`.

### No sale or advertising

The software has no feature to sell personal data, share it with advertisers, or build advertising profiles. It has no analytics or advertising scripts.

## 5. Why it is held

The Club holds the data to:

- run the tournament, including entries, eligibility, categories, tees, flights, groups, and start times;
- import the NGAP export, freeze the index at the cut-off, and work out the playing handicap;
- publish the draw and print the sheets the desk uses on the day;
- identify players at the desk and answer questions about an entry;
- keep a record of who registered, changed, or published an entry, so decisions can be checked and disputes resolved;
- keep the player profile, including a photo where consent was given, and produce tournament posters;
- give staff accounts the access they need to do the above.

The software is not used for marketing. It does not send newsletters or promotional email. The only email it sends is account confirmation and password reset from the sign-in service.

The software does not hold scores. Scores are kept on paper.

## 6. Legal basis

The Philippine Data Privacy Act of 2012 (Republic Act No. 10173) requires a lawful basis for holding personal data.

For the player directory, entries, handicap history, draw, published pairings, and audit records, the Club relies on its legitimate interest in organising and running the competition it has organised. The data is limited to what the competition needs.

For photographs, the Club relies on your consent. Consent is recorded per photo. You can withdraw it, as explained in section 8.

For staff accounts, the Club needs the account to give access to its desk. The basis is the Club's legitimate interest in running its operations, together with any employment or contractor terms that apply.

If you are a guest or a non-member, the Club still needs the data to run the event you entered.

The public entry form does not ask for a general consent tick box. The photo consent box is separate.

If you object to processing based on legitimate interest, contact the Club. The Club will consider your objection.

## 7. Retention

The software has no automatic deletion schedule. Records stay until the Club deletes them. That includes player records, entries, handicap history, published versions, photos, and staff audit records.

Each publish stores a frozen version of the draw, including player names. Unpublishing hides the page but does not delete the older versions. Erasing a player record does not rewrite those frozen copies.

Browser copies of the desk or player area expire after 30 days and are cleared when the person signs out. See section 10.

\`[TO BE CONFIRMED BY THE CLUB: how long each type of record is kept, what triggers deletion, and how printed sheets and posters are handled]\`.

What the Club must decide:

- a period for player records, entries, handicap history, published versions, and staff audit records, rather than one period for everything;
- whether entries and handicap history are needed after an event to answer disputes;
- a separate period for photos;
- what happens to printed sheets and posters, which the software cannot recall;
- whether deleted records remain in backups and for how long. \`[TO BE CONFIRMED BY THE CLUB: the backup retention period]\`.

## 8. Photos and consent

A photo is optional. The public entry form does not ask for one. Photos are added by Club staff on the player profile.

A staff member must tick a box confirming that the player agreed before the app will save a photo. The consent text says the photo may be used for check-in, the player profile, and tournament posters.

Where a photo file is stored, it is kept in a private storage bucket. Staff screens load it through a temporary signed link. It is not on the public pairings page.

A poster or printout the Club makes is outside the software. Once a photo has been printed or shared, it cannot be recalled.

To withdraw consent, contact the Club. The Club removes the photo from the player record and updates the consent record. Where a photo file was stored, the Club deletes it. Future use stops. There is no withdrawal button in the player area; the Club does it for you.

Withdrawal does not affect use that already happened, and it cannot recall a printed poster or a copy someone else has saved.

If you are under 18, the Club may need a parent or guardian to consent. \`[TO BE CONFIRMED BY THE CLUB: whether the Club accepts players under 18 and how parent or guardian consent is recorded]\`.

## 9. Your rights

Under the Data Privacy Act, you have the right to:

- be informed about how your data is used;
- object to processing based on legitimate interest;
- access the data the Club holds about you;
- correct data that is wrong or incomplete;
- ask for erasure or blocking of data that is no longer needed, or that is being used unlawfully;
- complain to the National Privacy Commission (NPC).

This is a summary of the main rights. The law also gives other rights, including data portability where it applies.

To exercise a right, contact the privacy contact in section 1. The Club may ask for proof of identity so it does not give your data to someone else.

The Club will respond within the period the law and its rules require.

Some requests may be limited. A published version keeps the names that were in it, and a backup may keep a deleted record for a period. If the Club cannot erase something, it will explain why and what it can do.

A player can ask the Club to unlink an account from a player record. The software has no self-service unlink; the Club does it.

Staff users can make the same requests about their account email, display name, role, and audit records.

## 10. Cookies and browser storage

The app uses a small number of first-party cookies and some browser storage. It does not use advertising or analytics cookies, and it does not set third-party cookies.

| What it is | Where it lives | Why | How long |
| --- | --- | --- | --- |
| Language choice (\`desk-lang\`) | Cookie | Remember English, Tagalog, or Hiligaynon | 1 year |
| Sign-in session | Cookies set by Supabase Auth | Keep staff and players signed in | Browser session, or longer if "Remember me" is ticked |
| Remember me preference (\`teeline-remember\`) | Cookie | Remember the choice on this device | 30 days when ticked, otherwise browser session |
| Colour theme (\`starter-theme\`) | Browser local storage | Light, dark, or system | Until you clear site data |
| Rail width (\`teeline-rail\`) | Browser local storage | Keep the sidebar compact or expanded | Until you clear site data |
| Welcome dismissed (\`teeline-help-seen\`) | Browser local storage | Do not show the first-run welcome again | Until you clear site data |
| Offline copies | Browser IndexedDB and cache | Open the desk or player area without a signal | Up to 30 days, or until sign-out |

The language cookie is set only when you use the language picker. If you do not use it, the app reads your browser's language preference and does not set the cookie.

The theme is not a cookie. It is stored in your browser's local storage under \`starter-theme\`. The same is true of the sidebar width and the welcome state.

On a staff device, an offline copy can include player names, contact details, and handicap information. Photos are removed before the copy is stored. On a player device, the offline copy includes that player's own entry and published start, not phone, birthdate, or photo.

Signing out clears the offline copies and the app's page cache. It does not remove the language cookie or the colour theme.

Clearing cookies and site data in your browser removes all of the above. It will also sign you out and reset your language and theme choices.

## 11. How access is controlled

Access is controlled by database row-level security and staff roles. Photos are kept in a private bucket and loaded through temporary signed links. Passwords are handled by Supabase Auth, not stored in the tournament tables.

The software does not claim to be fully secure. Security also depends on the hosting providers, the device, and how staff use their accounts. If you think an account, a photo, or another record has been exposed, contact the Club.

## 12. Changes to this policy

The Club may update this policy. The version and date at the top change. The current version is the one published with the service.

\`[TO BE CONFIRMED BY THE CLUB: how players and staff will be told about material changes]\`.

If a change introduces a new use of personal data, the Club will ask for consent where the law requires it.

## 13. Contact

Privacy contact: \`[TO BE CONFIRMED BY THE CLUB: the name, role, email address, and postal address of the Club's data protection officer or privacy contact]\`.

For event questions, use the contact details the Club publishes with the event.

For a complaint about how your data was handled, contact the Club first. You can also complain to the National Privacy Commission.

## Notes for the club

These notes are for the Club and its legal adviser. They are not part of the policy.

1. **The photo path is split, and the plan is only half right.** \`docs/PLAN.md\` says the app has no upload path and \`photo_path\` is written by nothing. The repository is mixed. \`src/lib/data/supabase/players.ts\` has a \`saveConsentedPhoto\` function, and the older \`src/lib/data/supabase/persist.ts\` calls it and writes \`photo_path\` and \`photo_consent_at\`. But the active desk adapter (\`src/lib/data/supabase/adapters.ts\`) does not upload the image or write \`photo_path\`; its player update also ignores the photo fields, so removing a photo in the current desk may not clear \`photo_consent_at\` in the database. The current desk screens may therefore keep a newly added photo in the browser session only. The private bucket and the upload function exist, but the wiring is incomplete. The Club must clear consent by hand until it is wired. Confirm which path is live before telling players that a photo is stored. This draft uses "where a photo file is stored" for that reason.

2. **The public page is broader than "names, flight, hole and time".** The function returns the event name, date, start format, first tee time, published version, publish time, group number, and wave as well (\`supabase/migrations/20261022000000_versioned_publish.sql\`). The draft lists all of it. If the Club wants less, the function or the page must change.

3. **The landing page also makes data public.** \`public_open_events()\` exposes the name, dates, start format, first tee time, cut-off, and the count of confirmed entries for open events (\`supabase/migrations/20261033000000_public_open_events.sql\`). The brief's "pairings page only" description does not mention this. The draft lists it.

4. **The theme is not a cookie.** It is stored in \`localStorage\` under \`starter-theme\` (\`src/components/ThemeToggle.tsx\`). The language choice is the \`desk-lang\` cookie (\`src/lib/i18n/locales.ts\`). The draft says so. If the Club wants a cookie-only description, the code or the draft must change.

5. **Claiming a record is not identity-verified.** \`claim_player_record\` links a signed-in account to an unclaimed player record by NGAP number or exact full name (\`supabase/migrations/20261023000000_player_portal.sql\`). Anyone who knows a unique name or NGAP number could claim that record. The draft calls the link a convenience, not proof of identity. The Club should add a stronger check before the first real event.

6. **The consent record is a timestamp, not the wording.** The database stores \`photo_consent_at\`, not a copy of the consent text the player saw. Keep the version of the consent wording with the Club's records so it can show what was agreed.

7. **There is no automatic retention or deletion.** Published versions keep names after unpublish. Erasing a player row does not rewrite \`pairings_versions.snapshot\`, and it does not remove a stored photo object by itself. The Club needs a manual procedure for both.

8. **The role labels are narrower than the database rules.** Policies on \`players\`, \`registrations\`, \`handicap_records\`, \`courses\`, \`tees\`, and \`holes\` still allow any club member, including \`desk\`, to write. The role checks are tighter for tournaments, event setup, draw saves, and publishing. If the Club wants desk staff to only register players, those older policies need tightening.

9. **The player portal matches a start by exact full name.** \`player_portal_entries\` finds the published group by comparing the player's full name (\`supabase/migrations/20261023000000_player_portal.sql\`). Two players with the same full name could see the same group and time. Matching on a stable id would remove the ambiguity.

10. **The public entry form has no rate limit or CAPTCHA.** It can create player rows for any open event. Consider adding a limit before launch. This is an abuse and data-quality issue, not a claim that anything has gone wrong.

11. **The staff spotlight display also reads the photo.** The display route is behind staff sign-in, but the photo is shown on screen (\`src/app/(display)/spotlight/[id]/page.tsx\`, \`src/lib/ui/spotlight.ts\`). The consent text mentions check-in, the player profile, and posters, not a clubhouse display. If the Club uses the spotlight where players or guests can see it, update the consent wording before doing so.
`;
