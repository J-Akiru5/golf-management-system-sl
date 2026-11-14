/**
 * The public Rules page for the 24th IGCCI Bamboo Tee Invitational.
 *
 * The content is transcribed from the organizers' official "Conditions of Play" PDF (five pages,
 * 31 October 2026). It is a reading aid, not the governing document: the PDF is linked beside the
 * content, and the official copy controls if the two ever differ.
 *
 * The meeting-agenda pages were removed from the public PDF on 14 November 2026. The confirmed
 * answers that the committee recorded are still on this page, sourced as committee decisions when
 * they are not printed in the PDF.
 *
 * To publish the next event's rules, replace this module and the PDF in `public/documents`.
 */

export type RulesCalloutTone = "penalty" | "local" | "note";

export interface RulesCallout {
  tone: RulesCalloutTone;
  title: string;
  body: string;
  items?: readonly string[];
}

export interface RulesTable {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}

export interface RulesGroup {
  title: string;
  items: readonly string[];
}

export interface RulesSection {
  id: string;
  title: string;
  summary: string;
  source: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
  groups?: readonly RulesGroup[];
  tables?: readonly RulesTable[];
  callouts?: readonly RulesCallout[];
  /** The first section is open so a reader sees the format without a tap. */
  defaultOpen?: boolean;
}

export interface RulesQuickFact {
  term: string;
  value: string;
}

export interface TournamentRulesDocument {
  eventName: string;
  dates: string;
  venue: string;
  title: string;
  subtitle: string;
  quickFacts: readonly RulesQuickFact[];
  pdf: {
    href: string;
    fileName: string;
    pageCount: number;
  };
  sections: readonly RulesSection[];
}

export const BAMBOO_TEE_2026_RULES: TournamentRulesDocument = {
  eventName: "24th IGCCI Bamboo Tee Invitational",
  dates: "12-15 November 2026",
  venue: "Santa Barbara, Iloilo",
  title: "Conditions of Play",
  subtitle:
    "The tournament rules for the 24th IGCCI Bamboo Tee Invitational, arranged for reading on a phone. The official PDF is the governing copy.",
  quickFacts: [
    { term: "Format", value: "36-hole Stableford, two-person teams" },
    { term: "Field", value: "200 teams / 400 players" },
    { term: "Handicap", value: "NGAP WHS index, capped at 30" },
    { term: "Divisions", value: "Class A (0-12) to Class D (24 and above)" },
    { term: "Entry", value: "PHP 12,000 per team" },
    { term: "Gimme", value: "24 inches" },
  ],
  pdf: {
    href: "/documents/24th-bamboo-tee-conditions-of-play.pdf",
    fileName: "24th-bamboo-tee-conditions-of-play.pdf",
    pageCount: 5,
  },
  sections: [
    {
      id: "format",
      title: "Tournament format",
      summary: "Two-person teams, 36 holes, aggregate Stableford, amateur only.",
      source: "Conditions of Play, pages 1-2",
      defaultOpen: true,
      paragraphs: [
        "The tournament is a 36-hole Stableford competition among two-person teams. The team with the highest 36-hole aggregate score in each division wins.",
        "Each partner plays their own ball. Each player receives an individual handicap, and both players' Stableford points on every hole are added together for the team's aggregate score.",
        "The event is played under the Rules of Golf as adopted by R&A Rules Limited, together with the local rules on this page.",
      ],
      bullets: [
        "The competition is for amateur golfers only. Touring or teaching professionals and active caddies may not play.",
        "A team is one IGCCI member and one guest. The member may be an active playing member, a nominee, or a proprietary non-playing shareholder in good standing.",
        "The field is limited to 200 teams (400 players). The committee may increase or decrease that limit.",
        "Entries are first paid, first served. A slot is confirmed only when payment is received. Once the field is full, teams go on a paid waiting list and are refunded if they cannot be accommodated.",
        "The registration cut-off is 22 October 2026 and is strictly applied.",
        "Entry is PHP 12,000 per team. Register on or before 15 October 2026 and receive one free Joker mulligan for each day.",
        "Caddy fee is PHP 700 minimum. Cart rental is PHP 1,500 for a 4-seater and PHP 900 for a 2-seater.",
      ],
      callouts: [
        {
          tone: "note",
          title: "Team composition",
          body: "The committee decided that a member may not partner another member, while a guest may partner another guest. The printed Conditions of Play describe a team as one member and one guest; ask the tournament desk before registering a team that does not fit that description.",
        },
      ],
    },
    {
      id: "handicap",
      title: "Handicap and divisions",
      summary: "NGAP WHS index, capped at 30. Team average sets the division.",
      source: "Conditions of Play, pages 1 and 3",
      paragraphs: [
        "Only an NGAP World Handicap System (WHS) certified handicap index is accepted. A foreign member-guest without a WHS index may use a USGA or R&A Golf Club of St Andrews accredited handicap provider.",
        "If a player holds more than one WHS handicap, the lowest index is used. The committee may adjust a registered handicap. A player with no WHS or verifiable handicap index is given a handicap of zero for the tournament.",
        "Willful and gross misrepresentation of a submitted handicap is cause for immediate disqualification.",
        "Team handicap is the rounded average of both players' handicaps and is used for classification. The committee adjusts handicaps under the IGCCI and WHS tee assignment computation when players use different tees.",
      ],
      tables: [
        {
          caption: "Divisions",
          columns: ["Division", "Team handicap", "Prizes"],
          rows: [
            ["Class A", "0-12", "Champion, 1st runner-up, 2nd runner-up"],
            ["Class B", "13-18", "Champion, 1st runner-up, 2nd runner-up"],
            ["Class C", "19-23", "Champion, 1st runner-up, 2nd runner-up"],
            ["Class D", "24 and above", "Champion, 1st runner-up, 2nd runner-up"],
            ["Over-all", "Gross score", "Champion team, no pick-up scores"],
            ["Net", "Stableford points", "Highest scoring team net"],
          ],
        },
        {
          caption: "Tee assignments",
          columns: ["Tee", "Players"],
          rows: [
            ["Blue", "Men below 60 years old"],
            ["White", "Men 60 years and above"],
            ["Silver", "Men 70 years and above"],
            ["Red", "Ladies"],
          ],
        },
      ],
      callouts: [
        {
          tone: "note",
          title: "Source note: two handicap dates",
          body: "The printed Conditions of Play use a player's WHS index for 30 September 2026. The committee's recorded decision gives 1 October 2026. The committee's ruling applies; ask the tournament desk if your index changed between those dates.",
        },
      ],
    },
    {
      id: "schedule",
      title: "Tee times and schedule",
      summary: "Shotgun starts, first paid first served, and the late-arrival rule.",
      source: "Conditions of Play, pages 3 and 5",
      paragraphs: [
        "Thursday to Saturday: 06:30 and 12:30 shotgun starts. Sunday: 06:30 and 11:30 PM shotgun starts, as printed in the official document.",
        "Tee times are first come, first paid, first served. Teams that have paid are prioritized. Members are paired with their guests on both playing dates where the schedule permits.",
        "Hole assignments and pairings are decided by the tournament committee and posted at Iloilo Golf & Country Club.",
      ],
      tables: [
        {
          caption: "Playing schedules",
          columns: ["Schedule", "Playing days"],
          rows: [
            ["Schedule 1", "Thursday AM to Saturday PM"],
            ["Schedule 2", "Thursday PM to Saturday AM"],
            ["Schedule 3", "Friday AM to Sunday PM"],
            ["Schedule 4", "Friday PM to Sunday AM"],
          ],
        },
      ],
      bullets: [
        "Teams in the same division are paired together. Only the tournament committee assigns designated tee-off holes and flightmates.",
        "Once a team chooses a schedule it is final. A change needs a valid reason and is subject to availability; the rules committee decides whether the reason is valid.",
        "A team that does not tee off on its designated hole and skips holes is disqualified.",
      ],
      groups: [
        {
          title: "Late to tee off",
          items: [
            "A late team may catch up on the hole with its flight if the other team has not made its second shot on that hole. Otherwise the late team tees off on the next hole.",
            "The marker records X and zero points on every hole left unplayed. The same rule applies to a playing partner who is late.",
          ],
        },
      ],
      callouts: [
        {
          tone: "note",
          title: "Source note: Sunday start time",
          body: "The official PDF prints 11:30 PM for Sunday's second shotgun start. Confirm the intended time with the tournament committee before relying on it.",
        },
      ],
    },
    {
      id: "local-rules",
      title: "Local rules and scoring",
      summary: "Hole 1 No Play Zone, Stableford points, the pick-up rule and card penalties.",
      source: "Conditions of Play, pages 2 and 3",
      paragraphs: [
        "The tournament uses the Stableford point system, net of handicap on each hole.",
        "To keep play moving, a player who no longer has a chance to score a point on a hole must pick up, stop playing the hole and tell their scorer. The player scores zero for the hole and the scorer marks an X. The penalty for not picking up is two points deducted from the player's score for the day for each infraction, as attested by members of the flight.",
        "Changing balls on the green is not allowed unless the ball is unfit for play under the R&A Rules.",
      ],
      tables: [
        {
          caption: "Stableford points, net of handicap per hole",
          columns: ["Score", "Points"],
          rows: [
            ["Double bogey", "0"],
            ["Bogey", "1"],
            ["Par", "2"],
            ["Birdie", "3"],
            ["Eagle", "4"],
            ["Albatross", "5"],
          ],
        },
      ],
      callouts: [
        {
          tone: "local",
          title: "Hole 1: No Play Zone",
          body: "The triangular area on the left side of the drive area of Hole No. 1 is a No Play Zone. A ball inside it gets one penalty shot, and the next stroke is played from the designated drop area (Rule 17.1d).",
        },
        {
          tone: "penalty",
          title: "Signing for a score above a net bogey",
          body: "If a player signs for a score higher than a net bogey, the player is treated as having made that score and is subject to the penalty clause. Breach: disqualification.",
        },
      ],
    },
    {
      id: "pace",
      title: "Pace of play",
      summary: "40 seconds to play, keep pace with the group ahead, and respect the marshals.",
      source: "Conditions of Play, page 3, and a committee decision",
      paragraphs: [
        "All players must keep the proper pace of play. If a group falls behind and has an open hole in front of it, a rules official warns the group and asks it to speed up and keep pace with the group ahead.",
        "A player has 40 seconds to hit the ball once it is their turn.",
        "Players may not unduly delay play by stopping at the clubhouse or tee houses. Takeout is allowed. The penalty is two points deducted from the day's score for each infraction.",
      ],
      callouts: [
        {
          tone: "penalty",
          title: "Failure to keep pace",
          body: "If a flight does not respond to the rules official after several warnings, it may receive a two-point deduction and/or be marked zero points for each hole open in front of it. The rules official or marshal decides.",
        },
      ],
      bullets: [
        "Marshal decisions must be respected. Failure to follow a marshal incurs a penalty based on the infraction.",
      ],
    },
    {
      id: "mulligans",
      title: "Mulligans and gimme",
      summary: "Joker rules, declaration, and the 24-inch gimme.",
      source: "Conditions of Play, pages 3-4, and a committee decision",
      paragraphs: [
        "One front and one back for two days costs PHP 1,000. A Joker mulligan for two days costs PHP 500.",
        "A Joker mulligan may be used once anywhere except on the putting green. A maximum of three mulligans may be used per day. A player who received a free Joker mulligan through the early registration promo may not buy another Joker mulligan.",
        "The gimme is 24 inches.",
      ],
      bullets: [
        "Before taking a mulligan, the player must tell their marker. The marker writes the letter M on the hole where it was used.",
        "A provisional mulligan is not allowed.",
        "A hole-in-one made on a par 3 with a mulligan is not eligible for the hole-in-one prize.",
      ],
      callouts: [
        {
          tone: "note",
          title: "Purchased and free Joker mulligans follow the same mechanics",
          body: "The declaration, the M on the card, the putting-green restriction and the par-3 prize restriction apply whether the Joker mulligan was bought or given during the early registration promo.",
        },
      ],
    },
    {
      id: "scorecards",
      title: "Scorecards and disputes",
      summary: "The other team marks, both players sign, and cards are due within 15 minutes.",
      source: "Conditions of Play, pages 1-2, and a committee decision",
      paragraphs: [
        "The other team on the flight acts as marker. If the other team withdraws or is disqualified, a marshal is assigned as marker for the remaining team.",
        "Both the player and the marker must sign the card. The card must be submitted within 15 minutes after the final hole is holed out. A late card is not counted.",
        "Incorrect, incomplete or unsigned cards are assessed by the tournament committee and receive the corresponding penalties under the Rules of Golf.",
        "The Tournament Director's decision in all matters affecting play is final. The Director may change the format, rules or prizes, and may accept, reject or adjust a player's handicap in the interest of fair play. The competition is closed once the prizes have been presented.",
        "Taking liberties with the rules results in disqualification. The committee has sole discretion and the decision is not subject to appeal.",
      ],
      callouts: [
        {
          tone: "penalty",
          title: "Only players may score",
          body: "Caddies may not record scores. Only players may score other players. Use the official pen issued by the Tournament Organizing Committee. Breach: disqualification.",
        },
      ],
    },
    {
      id: "ties",
      title: "Tie-breaking",
      summary: "Countback on holes 16-18, then 13-15, then drawing of lots.",
      source: "Conditions of Play, page 2, and a committee decision",
      paragraphs: [
        "Ties are settled by matching the final round score cards and comparing the team's aggregate points over the holes below. The procedure applies to the overall winner and the category winners.",
      ],
      bullets: [
        "First: total net team score on holes 16, 17 and 18.",
        "Second: total net team score on holes 13, 14 and 15.",
        "If a winner is still not decided, the tie is settled by drawing lots.",
      ],
    },
    {
      id: "weather",
      title: "Weather and suspension",
      summary: "The Tournament Director decides. One complete round can decide the result.",
      source: "Committee decision",
      paragraphs: [
        "The Tournament Director has the discretion and authority to suspend or resume play for any reason.",
        "If play is cancelled, only completed rounds count toward the team's score. One complete round is the minimum needed to declare official results; the team with the highest points in that round wins.",
      ],
    },
    {
      id: "withdrawals",
      title: "Withdrawals and substitutions",
      summary: "What happens if a partner withdraws before or after tee-off, or is disqualified.",
      source: "Committee decision",
      groups: [
        {
          title: "Before tee-off",
          items: [
            "A substitute needs the Tournament Director's approval. The replacement must preserve the team's composition: member for member, guest for guest.",
            "The committee adjusts the team handicap once the substitution is approved.",
            "A disqualified partner may be substituted on the same terms.",
          ],
        },
        {
          title: "After tee-off",
          items: [
            "The remaining partner may continue. Only holes actually played count toward the team's score.",
            "If a partner is disqualified, the committee assesses the grounds. The disqualified partner's scores may count on holes played, or none of the scores may count, depending on the infraction.",
            "If no substitute is available, the remaining player continues and only that player's scores count.",
          ],
        },
      ],
    },
    {
      id: "prizes",
      title: "Prizes, hole in one and raffle",
      summary: "Division prizes, the hole-in-one witness rule, and who may win a raffle prize.",
      source: "Conditions of Play, pages 3-4, and a committee decision",
      paragraphs: [
        "Each class awards a champion, first runner-up and second runner-up. The highest scoring team net and the over-all champion team gross are also recognized. The over-all gross champion must have no pick-up scores.",
      ],
      bullets: [
        "A hole-in-one prize is split equally among the players who make one, unless the sponsor's conditions say otherwise. At least three players or witnesses from the same flight, including the player who made the hole in one, must be present.",
        "All official registrants are eligible for the hole-in-one prize. The sponsor and Tournament Director sign a written contract setting out the prize and its conditions.",
        "Raffle winners must be present at the welcome and awards dinners, except for the mulligan raffle. Board members, committee members and staff who are playing registrants may win.",
      ],
    },
  ],
} as const satisfies TournamentRulesDocument;
