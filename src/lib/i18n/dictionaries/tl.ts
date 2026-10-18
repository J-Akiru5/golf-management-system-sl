import type { Dictionary } from "./en";

/**
 * Tagalog (Filipino). Golf terms stay in English on purpose (flight, tee, handicap, hole, shotgun,
 * pairing): that is how the club speaks. Draft, pending review by a native speaker at the club,
 * see docs/i18n-review.md.
 */
export const tl: Dictionary = {
  common: {
    language: "Wika",
    print: "I-print",
    close: "Isara",
  },
  player: {
    title: "Ang golf ko",
    nav: {
      allPairings: "Lahat ng pairing",
      signOut: "Mag-sign out",
    },
    fact: {
      start: "Simula",
      flight: "Flight",
      tee: "Tee",
      playingHandicap: "Playing handicap",
      entryHandicap: "Handicap ng entry",
      payment: "Bayad",
    },
    value: {
      notPlacedYet: "Wala pang grupo",
      notSetYet: "Hindi pa nakatakda",
      dateTbc: "Petsa ay kukumpirmahin pa",
      shotgun: "Shotgun start",
      twoTee: "Two-tee start",
    },
    status: {
      ok: "Nakarehistro",
      needsReview: "Natanggap ang entry, sinusuri ng club",
      ineligible: "Hindi maipapasok sa grupo",
    },
    payment: {
      paid: "Nakatala bilang bayad",
      waived: "Hindi sisingilin",
      unpaid: "Wala pang tala",
    },
    start: {
      hole: "Hole {hole}{wave}",
      tee: "Tee {hole}",
      notPublished: "Wala pa ang pairings.",
      notListed: "Wala ang grupo mo sa nailathalang listahan. Tanungin ang club.",
    },
    published: {
      yes: "Ito ang nailathalang pairings.",
      no: "Hindi pa nailalathala ng club ang pairings.",
    },
    seeFullList: "Tingnan ang buong listahan",
    noEntries:
      "Wala ka pang entry sa talaan. Mag-entry gamit ang link na ipinadala ng club, o pakiusapan ang club na idagdag ka sa event.",
    claim: {
      heading: "I-link ang record mo sa club",
      body: "Hindi pa naka-link ang account na ito sa isang member record, kaya wala pang maipapakita. I-link ito nang isang beses: itutugma ng club ang ilalagay mo sa listahan ng miyembro, tulad ng ginagawa ng entry form.",
      name: "Buong pangalan, ayon sa record ng club",
      ngapId: "NGAP number (kung alam mo)",
      help: "Ang pangalang tumutugma sa mahigit isang miyembro ay tinatanggihan, hindi hinuhulaan, kaya ang NGAP number ang nagpapasya.",
      submit: "I-link ang record ko",
      linked: "Naka-link na ang member record mo sa account na ito.",
      notReady:
        "Hindi pa bukas ang player area para sa project na ito. Kailangan munang i-apply ng club ang player portal migration.",
      failed: "Hindi na-link ang record mo ngayon. Subukan muli mamaya.",
      invalid: "Ilagay ang buong pangalan, o ang NGAP number mo.",
      tooLong: "Mas mahaba iyon kaysa sa talaan ng club. Suriin at subukan muli.",
      ambiguous:
        "Mahigit isang member record ang tumutugma. Idagdag ang NGAP number mo para maipaliwanag ng club ang pagkakaiba.",
      noMatch:
        "Walang member record na tumutugma sa mga detalyeng iyon. Ipagawa sa club na idagdag ka, o mag-entry gamit ang link ng event.",
      taken: "Naka-link na ang member record na iyon sa ibang account. Ipasuri ito sa club.",
      signedOut: "Nag-expire ang session mo. Mag-sign in muli.",
      alreadyLinked: "Naka-link na ang member record mo sa account na ito.",
    },
    error: {
      notReady:
        "Hindi pa bukas ang player area para sa project na ito. Kailangan munang i-apply ng club ang player portal migration.",
      session: "Nag-expire ang session mo. Mag-sign in muli para makita ang entry mo.",
      generic: "Hindi nag-load ang player area: {message}",
    },
    demo: {
      body: "Demo data ang build na ito at walang account, kaya walang player area dito.",
      link: "Naroon ang nailathalang pairings",
    },
  },
  pairings: {
    title: "Pairings ng tournament ng club",
    shotgun: "Shotgun start",
    twoTee: "Two-tee start",
    failedTitle: "Hindi ma-load ang pairings ngayon.",
    failedBody: "Subukan muli pagkalipas ng ilang minuto.",
    notOutTitle: "Wala pa ang pairings.",
    notOutBody: "Bumalik muli mamaya.",
    version:
      "Pairings version {version} · na-update {when} (Philippine time). Kung may nakaprinta kang kopya, tingnan kung tugma ang version.",
    versionNoNumber:
      "Na-update {when} (Philippine time). Kung may nakaprinta kang kopya, tingnan kung tugma ang version.",
    footer: "Pangalan, flight, hole at oras lamang.",
    home: "TeeLine Golf home",
    demoFooter:
      "Lokal na demo preview ito, hindi nailathalang pahina. Pangalan, flight, hole at oras lamang ang nakikita.",
    findName: "Hanapin ang pangalan mo",
    filterFlight: "I-filter ayon sa flight",
    allFlights: "Lahat ng flight",
    groupHole: "Hole {hole}",
    groupHoleWave: "Hole {hole} · Wave {wave}",
    groupTee: "Tee {hole}",
    noMatch: "Walang nahanap sa pangalan o flight na iyon.",
  },
  enter: {
    overline: "Entry sa tournament",
    title: "Mag-entry sa tournament",
    loading: "Naglo-load ang entry form…",
    demoTitle: "Demo data ang build na ito.",
    demoBody: "Ikonekta ang Supabase para makatanggap ng entries.",
    missingTitle: "Hindi nahanap ang tournament na iyon.",
    missingBody: "Tingnan ang link na ipinadala ng organizer.",
    errorTitle: "Hindi na-load ang entry form.",
    closedTitle: "Sarado na ang entries para sa event na ito.",
    closedDeadline: " Ang deadline ay {date}.",
    closedBody: "Makipag-ugnayan sa organizer.",
  },
};
