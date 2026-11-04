/**
 * Privacy copy shown at /privacy.
 *
 * Kept as a template string so the page needs no runtime file read. Keep the wording in step with
 * what the software actually does; it is the policy players and staff read.
 */
export const privacyMarkdown = `# Privacy Policy

**TeeLine Golf at Iloilo Golf and Country Club**
Version 1.0. 20 October 2026.

This policy explains how Iloilo Golf and Country Club ("the Club") handles personal data in TeeLine Golf ("the software"). TeeLine Golf is built and maintained by Syntaxure Labs ("Syntaxure"). The policy is written for players, club staff, and visitors to the public pages.

It describes what the software actually holds and shows. It does not replace the Club's own event rules or the advice of its legal adviser.

## 1. Who is responsible

The Club is the personal information controller for the player, entry, handicap, photo, and staff account data described here. The Club decides what is collected, why it is held, and who may see it.

Syntaxure Labs develops and maintains the software for the Club. Syntaxure does not run the tournament, decide entries, set handicaps, or take payments.

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

- A photo, only when you have given consent. The player record can store the file path and the date and time internal consent was recorded.
- A separate opt-in is required before a copy of the photo may appear on public pages. If you give that opt-in, the player record also stores a public copy path and the date and time public consent was recorded.
- The original file stays in a private storage bucket, not in the player table. Only the public copy, and only with the separate opt-in, is served from the public bucket.

### Staff accounts

- Your sign-in email, display name, and role: owner, organizer, or desk. Passwords are handled by Supabase Auth and are not stored in the tournament tables.
- Records of entries you registered or last changed, versions you published, import batches you created, and alerts you have read. These are audit and workflow records.

### Technical data

- The app's own tables do not store IP addresses, device identifiers, advertising IDs, or location data.
- The hosting providers may keep standard access logs. Their retention is outside the app.
- The app has no analytics, advertising, or tracking scripts. Fonts and other assets are bundled. The public pages do not call external font or script services.

## 3. What is public

### The published pairings page

\`/pairings\` is open to anyone. It does not need a login. When the Club publishes a draw, the page shows:

- the event name, date, start format, and first tee time;
- the published version number and the time it was published;
- for each group: the group number, wave when the event uses waves, starting hole, tee time, and flight name;
- the name of each player in the group;
- a small player photo, only where the player gave the separate public-display consent.

For a player, the only player data on the page is the name, flight, hole, tee time and, where separately consented, a public photo. The page does not show contact details, birthdate, handicap index, playing handicap, category, payment status, the private photo path, or staff account. It also does not show the gender field, home course, or NGAP number.

A flight name can itself say "Ladies", "Senior", or "Super Senior". That is the Club's label for the flight, and it is public as part of the flight name.

Before the Club publishes, the page may show the nearest event's name, date, start format, and first tee time with an empty state. It does not show player names or group details until a draw is published.

The page can be printed, and it may be indexed by search engines. Treat a published name, and a photo you chose to make public, as public.

### The public leaderboard

\`/leaderboard\` is open to anyone. It shows published gross and net results for a round, including the event name, day, version, player names, flight names, points and hole counts. It shows a small player photo only where the player gave the separate public-display consent. It does not show contact details, birthdate, handicap index, category, payment status or the private photo path.

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
- the private photo path, and any photo without the separate public-display consent;
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

### No sale or advertising

The software has no feature to sell personal data, share it with advertisers, or build advertising profiles. It has no analytics or advertising scripts.

## 5. Why it is held

The Club holds the data to:

- run the tournament, including entries, eligibility, categories, tees, flights, groups, and start times;
- import the NGAP export, freeze the index at the cut-off, and work out the playing handicap;
- publish the draw and print the sheets the desk uses on the day;
- identify players at the desk and answer questions about an entry;
- keep a record of who registered, changed, or published an entry, so decisions can be checked and disputes resolved;
- keep the player profile, including a photo where internal consent was given, and produce tournament posters; a separate public-display consent is required before a copy appears on public pages;
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

## 8. Photos and consent

A photo is optional. The public entry form does not ask for one. Photos are added by Club staff on the player profile.

There are two separate consents. The first lets the Club keep the photo on file and use it for check-in, the player profile and tournament posters. A staff member must tick that box before the app will save a photo.

The second consent is optional and separate. It lets the Club show a small copy of the photo beside the player's name on public pairings, the public leaderboard and printed start sheets. Ticking the first box does not tick the second, and an existing internal-only consent is not treated as public consent. The app keeps the original in a private bucket and writes a copy to a public bucket only when the second box is ticked.

A poster, printout, public web page or image someone saved is outside the software once it has been shared. Withdrawal removes the public copy and stops future public display, but it cannot recall a printed sheet or a copy someone else has saved. The hosting provider may also keep a cached copy briefly after the public file is removed.

To withdraw either consent, contact the Club. The Club removes the relevant photo, updates the consent record and, for public consent, deletes the public copy. Future use stops. There is no withdrawal button in the player area; the Club does it for you.

Withdrawal does not affect use that already happened, and it cannot recall a printed poster or a copy someone else has saved.

## 9. Your rights

Under the Data Privacy Act, you have the right to:

- be informed about how your data is used;
- object to processing based on legitimate interest;
- access the data the Club holds about you;
- correct data that is wrong or incomplete;
- ask for erasure or blocking of data that is no longer needed, or that is being used unlawfully;
- complain to the National Privacy Commission (NPC).

This is a summary of the main rights. The law also gives other rights, including data portability where it applies.

To exercise a right, contact the Club. The Club may ask for proof of identity so it does not give your data to someone else.

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

If a change introduces a new use of personal data, the Club will ask for consent where the law requires it.

## 13. Contact

For event questions, use the contact details the Club publishes with the event.

For a complaint about how your data was handled, contact the Club first. You can also complain to the National Privacy Commission.
`;
