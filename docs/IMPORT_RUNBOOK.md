# Registration workbook import: operator runbook

This is for the Syntaxure Labs person running the import. It assumes migration
`20261037000000` is applied and the desk is connected to the project.

## Before the file

1. Confirm the event in **Settings**: the event dates, the first tee time and the playing-day rule.
   A four-day event that requires two days is set to "Must play exactly 2".
2. Confirm the tees and holes are the club's real numbers. Placeholder numbers print a watermark.
3. Ask the club for the workbook as `.xlsx` if possible. A CSV export is accepted, but the original
   workbook keeps its formatting and worksheet names.
4. Do not edit the file to remove "duplicate" people before the preview. The preview shows whether
   they are the same person, a guest, or a real duplicate. Let the desk decide.

## The import

1. Open **Imports → Registration workbook**.
2. Choose the file. If it has more than one worksheet, choose the sheet.
3. Check the header row and the mapping. The club's usual columns are detected:
   `MEMBER`, `GUEST`, `GAME DATES`, `GENDER`, `DATE OF BIRTH`, `WHS ID/HANDICAP`, `CONTACT NO.`,
   `EMAIL`, `HOME COURSE`, T-shirt size and `PAID`.
4. If a column is wrong, change it and press **Refresh preview**. The preview is rebuilt from the
   file, not from the old rows.
5. Read the tiles:
   - **New registrations**: rows that will create a player and an entry.
   - **Already registered**: rows the importer will skip because the player is already in the event.
   - **Needs a decision**: ambiguous names, conflicting birthdates/NGAP IDs or an uncertain
     `GAME DATES` cell.
   - **Profiles to review**: new players with no birthdate or gender. They are saved, but the desk
     must complete the profile before they can be routed.
   - **Rejected rows**: rows with a hard problem. The reason is shown against the row.
6. Work through every **Needs a decision** row:
   - **Link** to the right candidate when it is the same person.
   - **Create separate** only when you know it is a different person with the same name. If the new
     player has no birthdate or gender, the profile is saved as Needs review.
   - **Skip** when the row should not be imported.
   - For an uncertain `GAME DATES` cell, click the day numbers to choose the days.
7. Check the rejected rows. A rejected row is recorded, not written. If it should be imported, fix
   the cell in the workbook and upload the corrected file; do not try to force the same file.
8. Tick the approval box. Press **Commit**.
9. Read the result. Success means the route has read the batch, the registrations and the day
   selections back from the database. A partial result says how many rows were rejected.
10. Open **Registration desk** and check the field count and a few players. The control room counts
    come from the same database. A full page reload must show the same people.

## After the import

- The batch id, the original file and the individual row outcomes are in the database. The original
  is in the private `registration-imports` bucket under the club id and the file's SHA-256.
- Re-uploading the same file for the same event returns the original batch. It does not duplicate
  registrations.
- A subsequent corrected file has a different SHA-256 and is a new batch. Rows already registered are
  skipped unless you explicitly choose **Update**.
- To change a player's days after the import, use the day buttons on the registration row. That is a
  separate write from the import and is audited.

## What the importer will not do

- It will not invent a birthdate or a gender. A new player without them is saved as **Needs review**;
  the desk completes the profile before the player can be routed.
- It will not copy the member's birthdate, contact, payment or shirt onto a guest in the same row.
- It will not merge a repeated player silently.
- It will not overwrite an existing registration or player profile. Existing registrations are
  skipped by default; a player's profile is edited on the player screen.
- It will not write anything if the database migration is missing. The page says so and the commit
  is disabled.
- It will not use the AI to write data. The AI can only suggest a column mapping from headers and
  value shapes; the server validates it and the operator approves it.

## If something goes wrong

| Symptom | What it means | What to do |
| --- | --- | --- |
| "The database update ... is not applied" | migration `20261037000000` is missing | stop; ask the owner to apply it; nothing was written |
| A row says "No birthdate or gender on the row" | the workbook has a name but no usable DOB/gender | the player is saved as Needs review; complete the profile on the Players screen |
| "More than one player matches" | the directory has two people with that name | use the NGAP ID to tell them apart, or choose the right candidate |
| "This event requires exactly N days" | the row's `GAME DATES` does not match the rule | correct the cell, or choose the days in the preview |
| "A registration already exists" | the player is already in the event | skip the row, or choose Update if the imported values should replace the blank ones |
| "The file changed since the preview" | the file was edited or replaced after the preview | preview the new file again |
| The commit returns a read-back mismatch | the database accepted a batch but the independent read did not match | do not retry blindly; send the batch id and the message to the owner |
