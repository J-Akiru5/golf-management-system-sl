import type { Dictionary } from "./en";

/**
 * Hiligaynon (Ilonggo). Golf terms stay in English on purpose (flight, tee, handicap, hole,
 * shotgun, pairing): that is how the club speaks. This is a draft and must be read by a native
 * speaker at the club before the event, see docs/i18n-review.md.
 */
export const hil: Dictionary = {
  common: {
    language: "Pulong",
    print: "I-print",
    close: "Sirado",
  },
  player: {
    title: "Ang akon golf",
    nav: {
      allPairings: "Tanan nga pairing",
      signOut: "Mag-sign out",
    },
    fact: {
      start: "Sugod",
      flight: "Flight",
      tee: "Tee",
      playingHandicap: "Playing handicap",
      entryHandicap: "Handicap sang entry",
      payment: "Bayad",
    },
    value: {
      notPlacedYet: "Wala pa sang grupo",
      notSetYet: "Wala pa ma-set",
      dateTbc: "Petsa nga i-confirm pa",
      shotgun: "Shotgun start",
      twoTee: "Two-tee start",
    },
    status: {
      ok: "Nakarehistro",
      needsReview: "Nabaton ang entry, ginatan-aw sang club",
      ineligible: "Indi maipasok sa grupo",
    },
    payment: {
      paid: "Narekord bilang bayad",
      waived: "Indi pabayron",
      unpaid: "Wala pa marekord",
    },
    start: {
      hole: "Hole {hole}{wave}",
      tee: "Tee {hole}",
      notPublished: "Wala pa ang pairing.",
      notListed: "Wala ang grupo mo sa ginpahayag nga listahan. Pamangkuta ang club.",
    },
    published: {
      yes: "Amo ini ang ginpahayag nga pairing.",
      no: "Wala pa ginpahayag sang club ang pairing.",
    },
    seeFullList: "Tan-awa ang bug-os nga listahan",
    noEntries:
      "Wala pa sang entry nga nakarekord para sa imo. Mag-entry paagi sa link nga ginpadala sang club, ukon pamangkuta ang club nga idugang ka sa event.",
    claim: {
      heading: "I-link ang imo record sa club",
      body: "Ini nga account wala pa naka-link sa isa ka member record, gani wala pa sang maipakita. I-link ini isa ka beses: i-compare sang club ang imo ginbutang sa listahan sang mga miyembro, pareho sang ginahimo sang entry form.",
      name: "Bug-os nga ngalan, suno sa record sang club",
      ngapId: "NGAP number (kon alam mo)",
      help: "Ang ngalan nga naga-match sa kapin sa isa ka miyembro ginadumili, indi ginahulaan, gani ang NGAP number ang nagasolbar.",
      submit: "I-link ang akon record",
      linked: "Naka-link na ang imo member record sa sini nga account.",
      notReady:
        "Wala pa bukas ang player area para sa sini nga project. Kinahanglan nga i-apply anay sang club ang player portal migration.",
      failed: "Wala ma-link ang imo record subong. Tilawi liwat sa madali.",
      invalid: "Isulat ang bug-os nga ngalan, ukon ang NGAP number mo.",
      tooLong: "Lawig pa ini sa record sang club. Susiha kag tilawi liwat.",
      ambiguous:
        "Kapin sa isa ka member record ang naga-match. Idugang ang NGAP number mo agod maipahayag sang club ang kinalain.",
      noMatch:
        "Wala sang member record nga naga-match sa amo nga detalye. Ipasugot sa club nga idugang ka, ukon mag-entry paagi sa link sang event.",
      taken: "Naka-link na ang amo nga member record sa iban nga account. Ipasusi ini sa club.",
      signedOut: "Tapos na ang imo session. Mag-sign in liwat.",
      alreadyLinked: "Naka-link na ang imo member record sa sini nga account.",
    },
    error: {
      notReady:
        "Wala pa bukas ang player area para sa sini nga project. Kinahanglan nga i-apply anay sang club ang player portal migration.",
      session: "Tapos na ang imo session. Mag-sign in liwat agod makita ang entry mo.",
      generic: "Wala nag-load ang player area: {message}",
    },
    demo: {
      body: "Demo data ang build nga ini kag wala sang account, gani wala sang player area diri.",
      link: "Ara ang ginpahayag nga pairing",
    },
  },
  pairings: {
    title: "Pairing sang tournament sang club",
    shotgun: "Shotgun start",
    twoTee: "Two-tee start",
    failedTitle: "Indi ma-load ang pairing subong.",
    failedBody: "Tilawi liwat pagligad sang pila ka minuto.",
    notOutTitle: "Wala pa ang pairing.",
    notOutBody: "Balik liwat sa madali.",
    version:
      "Pairing version {version} · gin-update {when} (Philippine time). Kon may nakaprinta ka nga kopya, tan-awa kon pareho ang version.",
    versionNoNumber:
      "Gin-update {when} (Philippine time). Kon may nakaprinta ka nga kopya, tan-awa kon pareho ang version.",
    footer: "Ngalan, flight, hole kag oras lamang.",
    home: "TeeLine Golf home",
    demoFooter:
      "Lokal nga demo preview ini, indi ginpahayag nga pahina. Ngalan, flight, hole kag oras lamang ang makita.",
    findName: "Pangitaa ang ngalan mo",
    filterFlight: "I-filter suno sa flight",
    allFlights: "Tanan nga flight",
    groupHole: "Hole {hole}",
    groupHoleWave: "Hole {hole} · Wave {wave}",
    groupTee: "Tee {hole}",
    noMatch: "Wala sang nakita sa amo nga ngalan ukon flight.",
  },
  enter: {
    overline: "Entry sa tournament",
    title: "Mag-entry sa tournament",
    loading: "Ginakarga ang entry form…",
    demoTitle: "Demo data ang build nga ini.",
    demoBody: "Ikonekta ang Supabase agod makabaton sang entries.",
    missingTitle: "Wala makita ang amo nga tournament.",
    missingBody: "Tan-awa ang link nga ginpadala sang organizer.",
    errorTitle: "Wala nag-load ang entry form.",
    closedTitle: "Sarado na ang entries para sa sini nga event.",
    closedDeadline: " Ang deadline amo ang {date}.",
    closedBody: "Palihug kontaka ang organizer.",
  },
};
