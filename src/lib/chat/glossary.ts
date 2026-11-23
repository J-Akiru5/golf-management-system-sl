/**
 * The short answers Teeo may give to general questions about the tournament and its golf terms.
 *
 * The wording is the organizer's, taken from the confirmed rules in
 * `docs/spec/IGCC_Tournament_Desk.md`. Teeo answers from this list and nothing else: a term that is
 * not here is passed to the organizer rather than improvised. Keeping the text here means the
 * answers are reviewed, testable and translated as one block, instead of whatever a model remembers
 * about golf.
 *
 * Each answer is at most two short sentences, because the chat's reply is capped at two sentences.
 * A definition never rules on the player's own card, score or eligibility.
 */

export interface GlossaryEntry {
  /** The term as a player would type it. */
  term: string;
  /** The approved answer, one or two short sentences. */
  answer: string;
}

export const CHAT_GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: "NGAP",
    answer:
      "The National Golf Association of the Philippines. It certifies handicaps, and the club imports your index from its record.",
  },
  {
    term: "Handicap Index",
    answer:
      "The WHS number from your best 8 of your last 20 rounds. The event freezes the index on its cut-off date.",
  },
  {
    term: "Course handicap",
    answer:
      "Your index converted to the tee you play: index times slope divided by 113, plus course rating minus par, rounded.",
  },
  {
    term: "Playing handicap",
    answer:
      "The course handicap after the event allowance, held to the event maximum of 30. It is the number the card is scored with.",
  },
  {
    term: "Stableford points",
    answer:
      "Points off your net score on a hole: net double bogey or worse 0, bogey 1, par 2, birdie 3, eagle 4, albatross 5.",
  },
  {
    term: "Tee colours",
    answer:
      "Blue for men under 60, White for men 60 to 74, Silver for men 75 and over, and Red for ladies.",
  },
  {
    term: "Shotgun start",
    answer: "Every group starts on a different hole at the same time.",
  },
  {
    term: "Member and guest pair",
    answer:
      "One member and one guest. Both play their own ball, and the pair's points are added together.",
  },
  {
    term: "Classes A to D",
    answer:
      "Class A is 0 to 12, B is 13 to 18, C is 19 to 23, and D is 24 and over, read from the pair's average index.",
  },
  {
    term: "Cut-off date",
    answer:
      "The date whose handicap index the event uses. A later index does not change an entry already frozen.",
  },
  {
    term: "Pick-up or X",
    answer: "An X on a hole. No point on that hole, no penalty, and no stroke is counted.",
  },
  {
    term: "Mulligan",
    answer: "A permitted replay. The score written on the card is still the score that counts.",
  },
];
