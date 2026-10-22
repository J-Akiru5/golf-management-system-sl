/**
 * terms copy. DRAFT: not reviewed by the club or its legal adviser.
 *
 * Generated from docs/legal by scripts/gen-legal.mjs. Edit the markdown and regenerate; do not
 * edit this file by hand, or the next run will overwrite it.
 */
export const termsMarkdown = `> **DRAFT — not reviewed by the club or its legal adviser. Do not publish as legal advice.**

# Terms of Service (draft)

**TeeLine Golf at Iloilo Golf and Country Club**
Version 1.0, draft. 20 October 2026.

These terms cover your use of TeeLine Golf ("the software"), the tournament service used by Iloilo Golf and Country Club ("the Club"). TeeLine Golf is built and maintained by Syntaxure Labs ("Syntaxure").

By using the public pages, entering an event, creating a player account, or signing in as staff, you agree to these terms. If you do not agree, do not use the software.

The Club's event rules also apply.

## 1. What the service is

TeeLine Golf is a web application for running a golf tournament. It holds player records, event setup, handicap imports, the draw, published pairings, print sheets, and a read-only player area.

The public pages include the home page, the published pairings page, the public leaderboard, the entry form, and the sign-in page. The player area is \`/my\`. The desk is for Club staff.

The software is not:

- a scoring system. Scores are kept on paper.
- a payment system, bank, e-wallet, or escrow.
- a handicap authority. The official index comes from NGAP.
- an NGAP system. The Club imports an NGAP export file; the software does not connect to NGAP.

## 2. Who runs it

The Club runs the event. It decides entries, categories, tees, flights, start times, payments, and withdrawals.

Syntaxure Labs supplies and maintains the software. It does not organise the event, decide who plays, set handicaps, take payments, or issue refunds.

## 3. Accounts

### Staff accounts

Staff accounts are created by the Club. There is no self-service staff sign-up. A staff account has one of three roles:

- **Owner.** Can read the Club's records, change event settings, publish or unpublish the draw, and manage staff accounts.
- **Organizer.** Can read the Club's records, change event settings, publish or unpublish the draw, and manage staff accounts.
- **Desk.** Can read the Club's records, register players, and edit entries.

The Club may change a role or close an account at any time. Staff must use the account only for Club business and must not share it.

### Player accounts

A player may create an account with an email address and a password. An account on its own shows nothing. To see an entry, the account must link a player record.

The link matches the full name or the NGAP number you enter. The match must be unique, and the record must not already be linked to another account. If the name is ambiguous or the record is taken, the software refuses the link and asks you to contact the Club.

Only claim your own record. Do not create an account for someone else, use someone else's NGAP number, or claim a record that is not yours.

The link is a convenience, not proof of identity. The Club may ask you to confirm your identity before it corrects a link.

### Passwords and account security

Passwords are handled by Supabase Auth. They are not stored in the tournament tables. Use a unique password and keep it to yourself. Tell the Club if you think your account has been accessed by someone else.

The Club may suspend or close an account that breaks these terms, interferes with the service, or puts another person's data at risk.

## 4. Entries

An entry is a request to play. It is not acceptance.

An entry sent through the public form is recorded as **Needs review**. The player area shows "Entry received, being checked by the club." A staff member checks it before it counts. The Club may ask for your NGAP number, proof of handicap, or other details.

One player may have one entry per event. The software refuses a duplicate entry for the same player and event.

The entry form stops accepting entries after the event's cut-off date. The Club sets that date.

The Club may:

- confirm the entry;
- mark it ineligible or keep it under review;
- correct a detail on the player record;
- move the player to a different category, tee, or flight;
- decide that the entry does not count.

If the Club moves a player by hand, the entry is marked as changed by hand. A move on the draw can carry a reason.

To withdraw, contact the Club. The player area is read-only, so there is no withdrawal button. The Club handles the withdrawal under its event rules.

## 5. Payments

> **The software does not charge or verify payments. Payment is recorded by hand.**

There is no card form, no payment gateway, no bank connection, and no automatic verification. Nothing is charged through the software.

A staff member records the payment state on the entry. The player area shows it as not recorded yet, recorded as paid, or waived. That label is the Club's internal record. It is not a receipt, a bank confirmation, or proof that money changed hands.

Cash or a bank transfer happens outside the software, under the Club's arrangements. If the entry form shows a bank name, account name, or account number, the Club typed it. Check it with the Club before sending money. The software cannot verify that the details are correct.

Refunds and withdrawals are handled by the Club under its event rules. The software does not process refunds.

## 6. Handicap and player data

Give accurate details. Your birthdate and gender decide your age category. Your NGAP number links your handicap. A wrong detail can put you in the wrong category or flight, or make your entry ineligible.

The official handicap index comes from NGAP. The software imports the Club's NGAP export. It does not calculate an official index.

The index used for an event is the latest index on or before the cut-off, frozen onto the entry. A later NGAP revision does not change that entry or a draw that has already been published.

The course handicap and playing handicap are worked out from the event's tee ratings, slope, par, and allowance. Those are event settings. They are not universal.

Each event sets its own maximum index and other rules. If your index is above the maximum, or the software cannot find a category, tee, or flight for you, your entry is marked **Ineligible** or **Needs review**. The player area may say "Cannot be placed in a group" or "Entry received, being checked by the club." The software does not give you a default category, tee, flight, or start. The Club decides.

Check your entry and start in \`/my\`, and check the published pairings page and the public leaderboard. The pairings page shows the current published version and the time it was published. If your name is missing or your time looks wrong, contact the Club before you play.

## 7. Acceptable use

Do not:

- enter false details, or use another person's name or NGAP number;
- claim a player record that is not yours;
- try to access another player's data, or an area of the desk you are not entitled to;
- probe, scan, or test the database or the access rules without the Club's written permission;
- scrape the pairings page, automate requests, or place an unreasonable load on the service;
- add or use a photo you do not have permission to use, or an unlawful or offensive image;
- share a staff account, or use a staff account for anything other than Club business;
- interfere with the service, or use it to harass another person.

The Club may suspend or close access if you break these rules.

## 8. Availability and changes

The software is provided as available. The Club does not guarantee uptime, that every page will load at the course, or that a saved copy is current.

The service may be slow or unavailable because of maintenance, a device or network problem, or an outage at a hosting provider such as Supabase or Vercel.

The Club may change, suspend, or withdraw a feature. It may correct an error and publish a new version of the draw.

The app can keep a saved copy for offline use. A saved copy can be out of date. It says when it was saved. Do not rely on a saved copy as your only record of your start time.

## 9. Liability

Nothing in these terms excludes liability that cannot be excluded under Philippine law.

To the extent permitted by law, the Club and Syntaxure Labs are not liable for indirect or consequential loss, lost profits, or loss caused by:

- relying on an out-of-date copy of a draw or a saved page;
- a device, network, or power failure;
- an outage at a hosting provider or another third party;
- a person sharing their account or password.

The Club is responsible for its event decisions, including entries, categories, handicaps, start times, payments, and refunds. Syntaxure Labs supplies the software and does not make those decisions.

You are responsible for the accuracy of what you submit and for keeping your account secure.

\`[TO BE CONFIRMED BY THE CLUB: whether a liability cap, insurance, or separate support agreement with Syntaxure Labs applies]\`.

## 10. Governing law and disputes

Philippine law governs these terms.

If a dispute cannot be resolved with the Club, it will be brought before \`[TO BE CONFIRMED BY THE CLUB: the agreed court or dispute-resolution venue]\`.

For a privacy complaint, contact the Club first. You can also complain to the National Privacy Commission. The Privacy Policy explains how the Club handles personal data.

## 11. Changes to these terms

The Club may update these terms. The version and date at the top change. The current version is the one published with the service.

If you keep using the software after a change, you accept the new terms. \`[TO BE CONFIRMED BY THE CLUB: how users will be told about material changes]\`.

## 12. Contact

For entry, payment, handicap, or start-time questions, use the contact details the Club publishes with the event.

For a question about these terms, \`[TO BE CONFIRMED BY THE CLUB: the Club contact for legal and terms questions]\`.

## Notes for the club

These notes are for the Club and its legal adviser. They are not part of the terms.

1. **Payment is manual and unverified.** The database stores \`unpaid\`, \`paid\`, or \`waived\` (\`supabase/migrations/20261017000000_init.sql\`). The app maps \`not_recorded\` and \`pending\` to \`unpaid\` (\`src/lib/data/supabase/domain.ts\`). There is no gateway, receipt, refund, or verification function. The terms say this in plain words.

2. **Every public entry is \`needs_review\`.** \`submit_registration\` always inserts that status (\`supabase/migrations/20261021000000_public_registration.sql\`). This is why the terms say an entry is not acceptance.

3. **A public entry can match an existing player without checking birthdate or gender.** The function matches by NGAP number first, then by exact full name. If it finds an existing player, the birthdate and gender on the form are not used to correct that record. The entry still lands as \`needs_review\`, so the desk must check it. The terms tell players to give accurate details; the desk procedure must catch the rest.

4. **Claiming a record is not identity-verified.** A signed-in account can claim an unclaimed player record by matching a unique full name or NGAP number. There is no email, birthdate, or club-card check. This is a privacy risk. The terms say the link is a convenience, not proof of identity. The Club should add a stronger check before launch.

5. **There is no self-service withdrawal, account deletion, or photo-consent withdrawal.** The player area is read-only. The Club handles these requests by hand. The terms say so rather than promising a button.

6. **There is no uptime promise or support level in the code.** The terms say the service is provided as available. If the Club wants a support window, response time, or event-day escalation, add it here.

7. **The Club's entry, withdrawal, refund, and payment rules are not in this repository.** The terms refer to "the Club's event rules" but do not state them. Add them, or link to where the Club publishes them, before these terms go live.

8. **The public entry form has no CAPTCHA or rate limit.** It can create player rows for any open event. Consider adding a limit before launch.

9. **The liability cap is deliberately a placeholder.** The Club and Syntaxure Labs have not agreed one in the code or the documents reviewed. Do not invent a figure.

10. **The staff role labels are narrower than the database rules.** The older policies let any club member, including \`desk\`, write player, course, and handicap tables. If the Club wants the labels to be exact, the policies need tightening. This does not change the player-facing terms, but it changes who can change a record.
`;
