/**
 * The NGAP's WHS frequently asked questions, in the NGAP's words.
 *
 * Source: the club's copy of \`NGAP-FAQs-FINALEDIT.pdf\` (6 pages), supplied by the owner on
 * 20 Oct 2026; the same text is archived at \`docs/ngap/wsh-faq.md\`. It describes the 2024 move to
 * the new WHS provider and the 2024 fee and billing rules. It is reference material, not club
 * policy: the page that renders it says where it came from and points at ngapwhs.com.
 *
 * Two defects in the source are recorded, not repaired: question 3 still contains the placeholder
 * "(indicate date)", and question 17's table is an image. Each carries a note.
 *
 * English only by the owner's decision; the rest of the player pages are translated.
 */
export interface NgapFaqItem {
  id: string;
  question: string;
  paragraphs: string[];
  bullets?: string[];
  /** A caveat shown with this question, for something the source could not supply. */
  note?: string;
}

export const NGAP_FAQ_SOURCE =
  "Published by the NGAP for the 2024 move to the new World Handicap System provider. Reproduced here from the club's copy of the NGAP FAQ document; the fees and dates are the 2024 ones.";

export const NGAP_FAQ_CURRENT =
  "The fees, dates and rules above are the ones the NGAP published for 2024. For the current position, check the NGAP WHS site or ask the club's handicapping committee:";

export const NGAP_FAQ: NgapFaqItem[] = [
  {
    id: "q1",
    question: "How much will it cost to be a member of WHS?",
    paragraphs: [
      "PHP 500 / year",
      "The NGAP will retain the PHP 500 fee for WHS membership for the calendar year 2024.",
    ],
  },
  {
    id: "q2",
    question: "When will members be billed?",
    paragraphs: [
      "For Club Members: May 1, 2024 for WHS membership for the calendar year 2024. For club members, your respective clubs will bill you accordingly.",
      "For Individual WHS Members: You may apply through https://docs.google.com/forms/d/1MnYII1wplcI2IZRWZ- exW2DG0qYhZNKxI1rCzns0PU0/viewform?edit_requested=true",
      "Once your application has been confirmed, you may enjoy all the same features that regular WHS Members have.",
      "For 2025 onwards: December 31 (previous year) for 6 months usage; January 1 – June 30 (of next year) June 1 for 6 months usage; July 1 – December 31 (of same year)",
    ],
  },
  {
    id: "q3",
    question: "Why did the NGAP change WHS providers?",
    paragraphs: [
      "First, the contract with Silicon had lapsed on (indicate date). Although Silicon continued to render services to NGAP after the contract had lapsed, the NGAP was prompted to seek competing bids for handicapping services after Silicon requested an increase in price from 30% to 50% share of the handicapping fee. The NGAP accepted bids from Silicon as well as other service providers with the intention of getting the best possible deal for the whole Philippine golfing community. Management reviewed all bid offers and presented the detailed offers to the Board for review and decision. Based on the costs and service features, Dot Golf was the unanimous choice of the Board.",
      "Furthermore, while Silicon may seemingly not have caused problems for individual members – and therefore the overall experience with them may have been satisfactory – the same was not the case at the level of the clubs and the NGAP itself. The aforementioned were encountering significant discrepancies with billings, in some instances being charged for more members than what was actually on the registered lists. The NGAP’s repeated attempts to resolve these issues with them were not successful, as Silicon did not provide the data needed for a reconciliation of the discrepancies. To label it simply as a non-payment or contractual dispute is thus not quite precise nor fair. The time was right to seek a new and better service provider that would deliver real value for what the NGAP and the members were paying.",
    ],
    note: "The NGAP document leaves the contract date as “(indicate date)”. The date was not supplied, and it has not been guessed here.",
  },
  {
    id: "q4",
    question:
      "Can’t the NGAP retrieve the historical data from the previous provider and ensure a complete transition of data?",
    paragraphs: [
      "We would like to make it clear that all the data housed in the previous platform (whs.ph) is solely owned by the NGAP. The NGAP is still currently trying to resolve the retrieval of historical data.",
      "In the article posted by Golf Pinoy Dotcom on December 31, 2023, the Silicon CEO had said, “To ensure a seamless transition, it is imperative to transfer the current database to the new handicapping service company appointed by NGAP. To facilitate this process, we kindly request your written consent to share your club members’ information with the foreign company contracted by NGAP.” However, even after the clubs had given their signed consent forms for data transfer, Silicon had still not furnished the NGAP with any historical data.",
      "Transitions without much cooperation are always difficult. Our previous transition from IPI to UNHS was even more difficult and took six months. We felt it more feasible, much faster, and less problematic to push forward even without the previous data, in light of the consideration that players’ indexes will normalize within 10-20 games.",
    ],
  },
  {
    id: "q5",
    question: "Who is the new WHS provider?",
    paragraphs: [
      "A wholly owned subsidiary of Golf New Zealand, Dot Golf has a 20-year history of working in the national golf organization website and software business. They have a proven record of delivering world-class software, systems, and solutions for golfers and golf clubs around the globe, including The R&A, England Golf, Golf Ireland, and Golf Australia, among many reputable organizations worldwide. Their core services include website and mobile app interfaces for handicap and golfing activity management.",
      "Moreover, Dot Golf is certified with The R&A and the USGA, which means that NGAP members now enjoy the benefit of having their handicap index valid wherever and whenever they play in tournaments abroad. Dot Golf has the expertise and capability to do daily handicapping, so as scores are encoded, members’ indexes will be updated daily per all R&A and USGA WHS rules and regulations.",
      "For more information, visit: https://www.dotgolf.co.nz/",
    ],
  },
  {
    id: "q6",
    question: "What are the new features of the new WHS?",
    paragraphs: [],
    bullets: [
      "Members will access their data through a unique username and password. The new WHS website is designed to counter any type of cyber attack or data breaches. Instead of displaying the whole WHS membership base to anyone who has access to the internet, the system requires one to log in through their unique credentials in order to access complete, personal player information.",
      "Daily handicapping (instead of bi-weekly), which is stipulated in the rules and regulations of The R&A and USGA. Previously the NGAP had just requested that The R&A and USGA allow the Philippine golfing community to operate using bi-weekly handicaps. As of 2024 The R&A and USGA has made daily handicapping compulsory.",
      "Updates in accordance with new rules and regulations of the R&A and USGA",
      "Independent WHS Member registration (no need to be a member of a golf club to be a WHS member)",
      "On-site help-desk",
      "Soon:",
      "Mobile application",
      "Media and articles section",
      "Tournament calendar section",
    ],
  },
  {
    id: "q7",
    question: "How do I benefit from being a member of a WHS that is R&A and USGA certified?",
    paragraphs: [
      "You are now truly part of the global golf community. Anytime that you or any member of the new WHS plays abroad, that member’s handicap index will be valid all over the world.",
      "Should a member decide to join any tournament abroad, tournament committees will honor the said member’s handicap index (as long as the player abides with the eligibility rules of the tournament’s Terms of Competition).",
      "Any member of a WHS that is R&A and USGA certified will have a handicap that is not drastically affected by any international changes in handicapping rules and regulations. An R&A and USGA certified WHS provider makes timely changes to its system so that its members do not experience any “jumps” in handicap indexes once changes in rules and regulations are made.",
    ],
  },
  {
    id: "q8",
    question: "Will my handicap index remain the same with the new provider? Will it be a zero?",
    paragraphs: [
      "Member’s indexes have been carried over from what it was from 15 December 2023, provided that you were a member of good standing with your respective club. It shall begin to change as your next games are encoded (16 December 2023 to date).",
      "The new provider has the capability and expertise to do daily handicapping, so as scores are encoded, members’ indexes will update on the daily. As the NGAP abides by the rules and regulations of the R&A and USGA by adopting daily handicapping, sand-bagging culture will slowly be mitigated in the Philippine golf ecosystem.",
    ],
  },
  {
    id: "q9",
    question: "Will I have access to my rounds from 2023 and previous years?",
    paragraphs: [
      "Unfortunately, Silicon did not cooperate throughout the initial transition. On the upside, however, the new platform works off the latest handicap index of members so the more games you play, the more accurate your handicap index becomes. The new website ngapwhs.com uses the exact same WHS algorithm solely licensed to the NGAP for the Philippines, so we can assure everyone that the computations are correct.",
      "Although members nor the NGAP currently do not have access to game data previous to 15 December 2023, the NGAP ensures its members that the transition to the new WHS provider will be worth it. As indexes will be updated on a daily basis, handicaps will now be more accurate than ever.",
      "Should you have any proof of your index from December 2023, please forward it to the NGAP through this email: handicapping.ngap@gmail.com, so our handicapping committee may evaluate if you may be assigned the same handicap index as your initial handicap on the new WHS platform.",
    ],
  },
  {
    id: "q10",
    question: "Will my data be safe with the new WHS provider?",
    paragraphs: [
      "As Dot Golf is a fully certified WHS provider of the R&A and USGA, it is compliant with local and international rules and regulations regarding data privacy and security.",
      "Dot Golf will give each WHS member a unique username and password in order to add a layer of protection for all of its members’ data. Dot Golf is also equipped with all the proficiencies needed to counter cyber attacks and data phishing.",
    ],
  },
  {
    id: "q11",
    question: "Has the NGAP collected from golf clubs for the calendar year 2023?",
    paragraphs: [
      "For the calendar year 2023, the NGAP has only started billing golf clubs during the second week of October 2023. The NGAP has been trying to reconcile billing invoices with the previous provider as the previous provider’s billing records have not matched with the recorded data of clubs and their corresponding members.",
      "Over the past 10 years, the previous provider’s billings have not accurately matched the list of members being submitted to the NGAP by the clubs.",
      "To date, only 12 out of 67 clubs have paid their 2023 membership dues in full. 54 out of 67 have remitted only partial payments to the NGAP.",
    ],
  },
  {
    id: "q12",
    question: "Will the new provider be accepting individual members?",
    paragraphs: [
      "For the first time ever, the new WHS provider will be allowing individual golfers to register directly under WHS.",
      "Individual members will pay the exact same membership fee as the members who are registered through their golf clubs. Individual members will enjoy the same services as members who are registered through their own member golf clubs.",
    ],
  },
  {
    id: "q13",
    question: "How will golf clubs encode the scores of their members?",
    paragraphs: [
      "Clubs will have access to a back-office administration system to manage members, add/update scores, print reports, etc. This system is referred to as the Clubhouse. This should enable clubs to do everything they need for handicapping purposes.",
    ],
  },
  {
    id: "q14",
    question: "Is this the final WHS website?",
    paragraphs: [
      "The ngapwhs.com domain will be the new and permanent home of the Philippine handicapping system. However, the website is currently in its beta form. In the upcoming months, the NGAP will be going through a ‘soft launch’ phase in order to set up all the features that would give the best value to all WHS members.",
    ],
  },
  {
    id: "q15",
    question: "Why do I need to register for a WHS account on ngapwhs.com?",
    paragraphs: [
      "In the meantime, all names and handicaps are open to public viewing through the search bar on the platform. Complete member handicaps and indexes (and all other pertinent information) will only be visible through individual logins on the ngapwhs.com website.",
    ],
  },
  {
    id: "q16",
    question: "How can I change my home club?",
    paragraphs: [
      "You may change your home club by requesting your new preferred home club to request for a change of home club. Your preferred home club (through their back-end access) will now request a club change from the current home club visible on the system.",
      "This request needs to be made on the club level for monitoring purposes. Your home club is in charge of billing you for your WHS Membership fees.",
    ],
  },
  {
    id: "q17",
    question: "Where can I see how my handicap was computed?",
    paragraphs: [
      "The handicap computation is algorithm-based. It is a long and tedious computation that the system automatically runs. As such, we do not show how handicaps are computed. However, please refer to this table as a general guide for which of your scores greatly affect your handicap.",
    ],
    note: "The original refers to a table of which scores affect your handicap. That table is an image in the PDF and is not reproduced here; the current guidance is on ngapwhs.com.",
  },
  {
    id: "q18",
    question: "Why is my handicap so low?",
    paragraphs: [
      "As we have migrated to a daily-handicapping system, your respective handicap will also adjust based on your latest encoded round. This is opposed to your handicap index adjusting based on your rounds played over a span of every 15 days with the previous provider. As more rounds of golf are encoded in the system, you will see your handicap index start to normalize.",
      "Countries licensed to use The R&A and USGA proprietary WHS algorithm are required to do daily handicapping as stipulated in the rules and regulations of The R&A and USGA. Previously the NGAP had just requested that The R&A and USGA allow the Philippine golfing community to operate using bi-weekly handicaps. As of 2024 The R&A and USGA has made daily handicapping compulsory.",
      "To the Philippine Golfing Community,",
      "We thank you for your patience as we strive to provide everyone with much better service, even if the initial experience may not seem as smooth as we would all like.",
    ],
  },
];
