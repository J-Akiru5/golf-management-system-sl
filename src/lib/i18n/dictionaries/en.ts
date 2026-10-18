/**
 * The English dictionary. It is the source of truth: every other locale must have exactly the same
 * keys, and the tests fail if one is missing, empty, or drops a `{placeholder}`.
 *
 * Rules for the words here:
 *   - Plain language. Short sentences. No marketing.
 *   - Golf terms stay in English (flight, tee, handicap, hole, shotgun, pairing), because that is
 *     what the club says; the surrounding sentence is what gets translated.
 *   - Nothing here claims more than the system knows: a payment is "recorded", never "confirmed".
 */
export const en = {
  common: {
    language: "Language",
    print: "Print",
    close: "Close",
  },
  player: {
    title: "My golf",
    nav: {
      allPairings: "All pairings",
      signOut: "Sign out",
    },
    fact: {
      start: "Start",
      flight: "Flight",
      tee: "Tee",
      playingHandicap: "Playing handicap",
      entryHandicap: "Entry handicap",
      payment: "Payment",
    },
    value: {
      notPlacedYet: "Not placed yet",
      notSetYet: "Not set yet",
      dateTbc: "Date to be confirmed",
      shotgun: "Shotgun start",
      twoTee: "Two-tee start",
    },
    status: {
      ok: "Entered",
      needsReview: "Entry received, being checked by the club",
      ineligible: "Cannot be placed in a group",
    },
    payment: {
      paid: "Recorded as paid",
      waived: "Waived",
      unpaid: "Not recorded yet",
    },
    start: {
      hole: "Hole {hole}{wave}",
      tee: "Tee {hole}",
      notPublished: "Pairings are not out yet.",
      notListed: "Your group is not on the published list. Ask the club.",
    },
    published: {
      yes: "These are the published pairings.",
      no: "The club has not published the pairings yet.",
    },
    seeFullList: "See the full list",
    noEntries:
      "No entries on file for you yet. Enter through the event link the club sent you, or ask the club to add you to the event.",
    claim: {
      heading: "Link your club record",
      body: "This account is not linked to a member record yet, so there is nothing to show. Link it once: the club matches what you enter against the member list, exactly as the entry form does.",
      name: "Full name, as the club has it",
      ngapId: "NGAP number (if you know it)",
      help: "A name that matches more than one member is refused rather than guessed, so the NGAP number settles it.",
      submit: "Link my record",
      linked: "Your member record is now linked to this account.",
      notReady:
        "The player area is not switched on for this project yet. The club has to apply the player portal migration first.",
      failed: "Your record could not be linked just now. Try again in a moment.",
      invalid: "Enter your full name, or your NGAP number.",
      tooLong: "That is longer than the club's records hold. Check it and try again.",
      ambiguous:
        "More than one member record matches that. Add your NGAP number so the club can tell them apart.",
      noMatch:
        "No member record matches those details. Ask the club to add you, or enter through the event link.",
      taken: "That member record is already linked to another account. Ask the club to check it.",
      signedOut: "Your session has ended. Sign in again.",
      alreadyLinked: "Your member record is already linked to this account.",
    },
    error: {
      notReady:
        "The player area is not switched on for this project yet. The club has to apply the player portal migration first.",
      session: "Your session has ended. Sign in again to see your entry.",
      generic: "The player area could not load: {message}",
    },
    demo: {
      body: "This build runs on demo data with no accounts, so there is no player area here.",
      link: "The published pairings are this way",
    },
  },
  pairings: {
    title: "Club tournament pairings",
    shotgun: "Shotgun start",
    twoTee: "Two-tee start",
    failedTitle: "Pairings can't be loaded right now.",
    failedBody: "Please try again in a few minutes.",
    notOutTitle: "Pairings are not out yet.",
    notOutBody: "Please check again later.",
    version:
      "Pairings version {version} · updated {when} (Philippine time). If you have a printed copy, check that the version matches.",
    versionNoNumber:
      "Updated {when} (Philippine time). If you have a printed copy, check that the version matches.",
    footer: "Names, flight, hole and time only.",
    home: "TeeLine Golf home",
    demoFooter:
      "This is a local demo preview, not a published page. It shows names, flight, hole and time only.",
    findName: "Find your name",
    filterFlight: "Filter by flight",
    allFlights: "All flights",
    groupHole: "Hole {hole}",
    groupHoleWave: "Hole {hole} · Wave {wave}",
    groupTee: "Tee {hole}",
    noMatch: "No one found with that name or flight.",
  },
  enter: {
    overline: "Tournament entry",
    title: "Enter the tournament",
    loading: "Loading the entry form…",
    demoTitle: "This build is running on demo data.",
    demoBody: "Connect Supabase to take tournament entries.",
    missingTitle: "That tournament was not found.",
    missingBody: "Check the link the organizer sent you.",
    errorTitle: "Could not load the entry form.",
    closedTitle: "Entries are closed for this event.",
    closedDeadline: " The deadline was {date}.",
    closedBody: "Please contact the organizer.",
  },
};

export type Dictionary = typeof en;
