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
      heading: "Can't see your entry?",
      body: "We match your account to your club record by name. If your entry is missing, enter the full name the club has on file, or your NGAP number.",
      name: "Full name, as the club has it",
      ngapId: "NGAP number (if you know it)",
      help: "A name that matches more than one member is refused rather than guessed, so the NGAP number settles it.",
      submit: "Find my entry",
      linked: "Your club record is linked. Your entries are below.",
      notReady:
        "The player area is not switched on for this project yet. The club has to apply the player portal migration first.",
      failed: "Your record could not be linked just now. Try again in a moment.",
      invalid: "Enter your full name, or your NGAP number.",
      tooLong: "That is longer than the club's records hold. Check it and try again.",
      ambiguous:
        "More than one member record matches that. Add your NGAP number so the club can tell them apart.",
      noMatch: "No club record matches those details yet. Ask the desk to link your entry.",
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
    footer:
      "Names, home club, handicap, category, flight, hole and time only. No contact details or photos.",
    home: "TeeLine Golf home",
    demoFooter:
      "This is a local demo preview, not a published page. It shows names, home club, handicap, category, flight, hole and time only.",
    findName: "Find your name",
    filterFlight: "Filter by flight",
    allFlights: "All flights",
    groupHole: "Hole {hole}",
    groupHoleWave: "Hole {hole} · Wave {wave}",
    groupTee: "Tee {hole}",
    noMatch: "No one found with that name or flight.",
  },
  programme: {
    navLabel: "On this page",
    navTeeTimes: "Tee times",
    navPlayers: "Players",
    navPairings: "Pairings",
    navRules: "Rules of play",
    teeTimesTitle: "Tee times by day",
    teeTimesIntro:
      "Confirmed start times for each playing day. A time the desk has not confirmed is not shown.",
    daysLabel: "Playing days",
    dayStart: "Day starts {time}",
    dayStartUnknown: "Day start time not set",
    hole: "Hole {hole}",
    toBeConfirmed: "Time to be confirmed",
    noDays: "This event has no playing days yet.",
    noPlayersDay: "No players have chosen this day yet.",
    playersTitle: "Players",
    playersIntro: "Name, home club, handicap index, category and flight.",
    playerCount: "{count} players",
    playerCountOne: "1 player",
    findPlayer: "Find a player",
    noPlayerMatch: "No player matches that name or club.",
    index: "Index",
    homeCourse: "Home club",
    unflighted: "Flight to be confirmed",
    rulesTitle: "Rules of play",
    rulesIntro: "Provided by the organizers.",
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
    form: {
      error: "The entry could not be sent.",
      fullName: "Full name",
      birthdate: "Date of birth",
      birthdateHelp: "Used for the age category on the day of play.",
      category: "Category",
      chooseOne: "Choose one",
      male: "Male",
      female: "Female",
      ngap: "NGAP number (optional)",
      ngapHelp: "Speeds up matching to your club record.",
      mobile: "Mobile number (optional)",
      homeCourse: "Home course (optional)",
      shirtSize: "Shirt size (optional)",
      playingAs: "Playing as",
      member: "Member",
      guest: "Guest",
      yes: "Yes",
      no: "No",
      teeTimes: "Preferred tee times",
      playingDays: "Playing days",
      playingDaysHelp:
        "Choose the days you will play. This is separate from a tee-time preference.",
      playingDaysRequired: "Choose exactly {count} playing day(s).",
      playingDaysMax: "Choose at most {count} playing day(s).",
      startsAt: "Starts {time}",
      day: "Day {number}",
      toBeConfirmed: " (to be confirmed)",
      noPreference: "No preference",
      teeTimesHelp: "A preference, not a confirmed start time.",
      declaredIndex: "Declared handicap index (optional)",
      declaredIndexPlaceholder: "14.2, +2.3 or NH",
      declaredIndexHelp:
        "For information only. The official index comes from the club's NGAP export.",
      wshId: "WSH ID (optional)",
      email: "Email (optional)",
      extraQuestions: "Extra questions",
      optional: " (optional)",
      entryFee: "Entry fee",
      paymentNote: "Payment is recorded by the organizer. Nothing is charged here.",
      sending: "Sending…",
      send: "Send my entry",
      reviewNote:
        "Your entry is reviewed by the organizer before it counts. You do not need an account.",
    },
  },
  help: {
    button: "Help",
    title: "Help",
    thisScreen: "This screen",
    more: "More help",
    showMe: "Show me",
    missing: "That control is not on this screen right now.",
    welcome: {
      player: {
        title: "Welcome to My golf",
        body: "Two things you can do here.",
        entries: "See your entry: start, flight, tee and payment.",
        pairings:
          "Find your group on the pairings page. The link needs no sign-in, so you can share it.",
        help: "Need a hand? The ? button is in the top bar, with steps for each screen.",
        button: "Got it",
      },
    },
    player: {
      my: {
        title: "My golf: your entry",
        summary: "What this page shows, and what to do when it is empty.",
        entry: "Your entries are listed here: the event, your start, flight, tee and payment.",
        notListed:
          "If your group is not out yet, the card says so. The club decides when pairings go out.",
        claim: "Nothing here yet? Link your club record with your full name or your NGAP number.",
        link: "The full player list is one tap away on the pairings page.",
      },
      pairings: {
        title: "Find your group",
        summary: "How to read the pairings page, and how to print it.",
        find: "Type part of your name to jump to your group.",
        flight: "The flight filter narrows a long list.",
        read: "Your card shows your hole or tee, the wave and the time.",
        print: "Print the list, and check the version line against any printed copy.",
      },
    },
  },
};

export type Dictionary = typeof en;
