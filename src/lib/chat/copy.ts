/**
 * Every fixed string the concern chat can say, in each language it speaks.
 *
 * The model phrases the questions; these strings are the guaranteed floor. They are used when the
 * model is unavailable, when its answer cannot be parsed, when a turn limit is reached, and for the
 * panel's own controls, so a player never faces an empty panel or an English-only error.
 *
 * English is the source of truth. Tagalog and Hiligaynon are drafts, as elsewhere in this app;
 * Cebuano is a new draft for the chat only and has had no native-speaker review yet.
 */

import type { ConcernKind, TeeColour } from "@/lib/data/concerns";
import type { ConcernField, OptionalConcernField } from "./fields";

export const CHAT_LOCALES = ["en", "tl", "hil", "ceb"] as const;
export type ChatLocale = (typeof CHAT_LOCALES)[number];
export const DEFAULT_CHAT_LOCALE: ChatLocale = "en";

/** The language's own name, for the picker. */
export const CHAT_LOCALE_LABELS: Record<ChatLocale, string> = {
  en: "English",
  tl: "Tagalog",
  hil: "Hiligaynon",
  ceb: "Cebuano",
};

/** What the model is told to write in. */
export const CHAT_LANGUAGE_NAMES: Record<ChatLocale, string> = {
  en: "English",
  tl: "Tagalog (Filipino)",
  hil: "Hiligaynon (Ilonggo)",
  ceb: "Cebuano (Bisaya)",
};

export function isChatLocale(value: unknown): value is ChatLocale {
  return typeof value === "string" && (CHAT_LOCALES as readonly string[]).includes(value);
}

/** A saved app locale maps onto a chat locale; an unknown one starts in English. */
export function chatLocaleFromAppLocale(value: unknown): ChatLocale {
  return value === "tl" || value === "hil" ? value : DEFAULT_CHAT_LOCALE;
}

export interface ChatCopy {
  tagline: string;
  quickReplies: readonly [string, string, string, string];
  quickRepliesLabel: string;
  greeting: string;
  fallback: string;
  fallbackTitle: string;
  turnLimit: string;
  rateLimited: string;
  submitSuccess: string;
  submitFailed: string;
  /** The browser's message could not be read at all. */
  badRequest: string;
  /** The database function that files the note is not applied yet. */
  notReady: string;
  confirmPrompt: string;
  readyToSend: string;
  summaryTitle: string;
  confirm: string;
  edit: string;
  editHint: string;
  send: string;
  sending: string;
  placeholder: string;
  openLabel: string;
  closeLabel: string;
  languageLabel: string;
  retry: string;
  /** Prefix shown on the summary card when the player declined an optional field. */
  notGiven: string;
  questions: Record<ConcernField, string>;
  fieldLabels: Record<ConcernField, string>;
  concernLabels: Record<ConcernKind, string>;
  teeLabels: Record<TeeColour, string>;
}

const EN: ChatCopy = {
  tagline: "Your tournament concern buddy.",
  quickRepliesLabel: "Quick replies",
  quickReplies: [
    "My name is misspelled",
    "A score looks wrong",
    "Question about my tee time",
    "Handicap question",
  ],
  greeting:
    "Hello, I am Teeo. Tell me your concern in your own words, and I will pass it to the organizer.",
  fallback:
    "I cannot answer just now. Please use the tick-box form at /feedback, and the organizer will read it.",
  fallbackTitle: "Use the form instead",
  turnLimit:
    "This chat is getting long. Please send the rest on the form at /feedback so nothing is lost.",
  rateLimited:
    "Too many messages just now. Please wait a few minutes, or use the form at /feedback.",
  submitSuccess: "Sent. The organizer will read your note.",
  submitFailed: "That did not send. Please try again, or use the form at /feedback.",
  badRequest: "I could not read that message. Please try again.",
  notReady: "The inbox is not switched on yet. Please use the form at /feedback later.",
  confirmPrompt: "Is this right?",
  readyToSend: "That is everything I need. Please check the note below.",
  summaryTitle: "Your note",
  confirm: "Confirm and send",
  edit: "Edit",
  editHint: "Tell me what to change, and I will update the note.",
  send: "Send",
  sending: "Sending",
  placeholder: "Tell Teeo your concern…",
  openLabel: "Ask Teeo",
  closeLabel: "Close the chat",
  languageLabel: "Language",
  retry: "Try again",
  notGiven: "Not given",
  questions: {
    concerns: "What is your concern about? You can name more than one.",
    holeNo: "Which hole number is it?",
    teeColour: "Which tee did you play from? Blue, silver, white or red.",
    otherText: "Tell me a little more, in your own words.",
    playerName: "What name is your entry under?",
    handicap: "What handicap should I put in the note? You can say skip.",
    schedule: "Which day and tee time is your entry for?",
  },
  fieldLabels: {
    concerns: "Concern",
    holeNo: "Hole",
    teeColour: "Tee",
    otherText: "Details",
    playerName: "Name",
    handicap: "Handicap",
    schedule: "Schedule",
  },
  concernLabels: {
    inquiry: "Inquiry",
    name_typo: "Name typo",
    schedule: "Schedule",
    handicap: "Handicap",
    score: "Score",
    tee_off: "Tee off",
    other: "Others",
  },
  teeLabels: { blue: "Blue", silver: "Silver", white: "White", red: "Red" },
};

const TL: ChatCopy = {
  tagline: "Kaibigan mo sa mga concern sa tournament.",
  quickRepliesLabel: "Mabilis na sagot",
  quickReplies: [
    "Mali ang baybay ng pangalan ko",
    "Parang mali ang score",
    "May tanong ako sa tee time",
    "Tanong tungkol sa handicap",
  ],
  greeting:
    "Kumusta, ako si Teeo. Sabihin mo ang concern mo sa sarili mong salita, at ipapaabot ko ito sa organizer.",
  fallback:
    "Hindi ako makasagot ngayon. Gamitin ang form na may tick boxes sa /feedback, at babasahin ito ng organizer.",
  fallbackTitle: "Gamitin ang form",
  turnLimit:
    "Humahaba na ang usapan. Ipadala ang natitira sa form sa /feedback para walang mawala.",
  rateLimited:
    "Sobrang dami ng mensahe ngayon. Maghintay ng ilang minuto, o gamitin ang form sa /feedback.",
  submitSuccess: "Naipadala na. Babasahin ito ng organizer.",
  submitFailed: "Hindi naipadala. Subukan muli, o gamitin ang form sa /feedback.",
  badRequest: "Hindi ko mabasa ang mensahe. Subukan muli.",
  notReady: "Hindi pa bukas ang inbox. Gamitin na lang ang form sa /feedback mamaya.",
  confirmPrompt: "Tama ba ito?",
  readyToSend: "Kumpleto na ang kailangan ko. Tingnan ang note sa ibaba.",
  summaryTitle: "Ang note mo",
  confirm: "Kumpirmahin at ipadala",
  edit: "Baguhin",
  editHint: "Sabihin kung ano ang babaguhin, at ia-update ko ang note.",
  send: "Ipadala",
  sending: "Ipinapadala",
  placeholder: "Sabihin kay Teeo ang concern mo…",
  openLabel: "Tanungin si Teeo",
  closeLabel: "Isara ang chat",
  languageLabel: "Wika",
  retry: "Subukan muli",
  notGiven: "Hindi binigay",
  questions: {
    concerns: "Ano ang concern mo? Puwede kang pumili ng higit sa isa.",
    holeNo: "Saang hole number ito?",
    teeColour: "Sa aling tee ka naglaro? Blue, silver, white o red.",
    otherText: "Ikwento mo nang kaunti, sa sarili mong salita.",
    playerName: "Anong pangalan ang nasa entry mo?",
    handicap: "Anong handicap ang ilalagay ko? Puwede mong sabihing laktawan.",
    schedule: "Aling araw at tee time ang entry mo?",
  },
  fieldLabels: {
    concerns: "Concern",
    holeNo: "Hole",
    teeColour: "Tee",
    otherText: "Detalye",
    playerName: "Pangalan",
    handicap: "Handicap",
    schedule: "Iskedyul",
  },
  concernLabels: {
    inquiry: "Katanungan",
    name_typo: "Mali ang pangalan",
    schedule: "Iskedyul",
    handicap: "Handicap",
    score: "Iskor",
    tee_off: "Tee off",
    other: "Iba pa",
  },
  teeLabels: { blue: "Asul", silver: "Pilak", white: "Puti", red: "Pula" },
};

const HIL: ChatCopy = {
  tagline: "Abyan mo sa mga concern sang tournament.",
  quickRepliesLabel: "Madasig nga sabat",
  quickReplies: [
    "Sayop ang spelling sang akon ngalan",
    "Daw sala ang score",
    "Pamangkot parte sa akon tee time",
    "Pamangkot parte sa handicap",
  ],
  greeting:
    "Kumusta, ako si Teeo. Isugid mo ang concern mo sa kaugalingon mo nga hambal, kag ipaabot ko ini sa organizer.",
  fallback:
    "Indi ako makasabat subong. Gamita ang form nga may tick boxes sa /feedback, kag basahon ini sang organizer.",
  fallbackTitle: "Gamita ang form",
  turnLimit:
    "Nagalaba na ang istorya. Ipadala ang nabilin sa form sa /feedback agod wala sing madula.",
  rateLimited:
    "Sobra na ang mga mensahe subong. Hulata sang pila ka minutos, ukon gamita ang form sa /feedback.",
  submitSuccess: "Napadala na. Basahon ini sang organizer.",
  submitFailed: "Wala napadala. Tilawi liwat, ukon gamita ang form sa /feedback.",
  badRequest: "Indi ko mabasa ang mensahe. Tilawi liwat.",
  notReady: "Wala pa bukas ang inbox. Gamita lang anay ang form sa /feedback.",
  confirmPrompt: "Husto bala ini?",
  readyToSend: "Kumpleto na ang kinahanglan ko. Tan-awa ang note sa idalom.",
  summaryTitle: "Ang note mo",
  confirm: "Kumpirmaha kag ipadala",
  edit: "Bag-uhon",
  editHint: "Isugid kon ano ang bag-uhon, kag i-update ko ang note.",
  send: "Ipadala",
  sending: "Ginapadala",
  placeholder: "Isugid kay Teeo ang concern mo…",
  openLabel: "Pamangkuta si Teeo",
  closeLabel: "Sirad-i ang chat",
  languageLabel: "Hambal",
  retry: "Tilawi liwat",
  notGiven: "Wala ginhatag",
  questions: {
    concerns: "Ano ang concern mo? Puwede ka magpili sang sobra sa isa.",
    holeNo: "Sa diin nga hole number ini?",
    teeColour: "Sa diin nga tee ka naglaro? Blue, silver, white ukon red.",
    otherText: "Isugid mo sing diutay, sa kaugalingon mo nga hambal.",
    playerName: "Ano ang ngalan sa entry mo?",
    handicap: "Ano nga handicap ang isulat ko? Puwede mo hambalon nga laktawi.",
    schedule: "Diin nga adlaw kag oras sang tee ang entry mo?",
  },
  fieldLabels: {
    concerns: "Concern",
    holeNo: "Hole",
    teeColour: "Tee",
    otherText: "Detalye",
    playerName: "Ngalan",
    handicap: "Handicap",
    schedule: "Iskedyul",
  },
  concernLabels: {
    inquiry: "Pamangkot",
    name_typo: "Sala ang ngalan",
    schedule: "Iskedyul",
    handicap: "Handicap",
    score: "Iskor",
    tee_off: "Tee off",
    other: "Iban pa",
  },
  teeLabels: { blue: "Asul", silver: "Pilak", white: "Puti", red: "Pula" },
};

const CEB: ChatCopy = {
  tagline: "Kauban nimo sa mga concern sa tournament.",
  quickRepliesLabel: "Dali nga tubag",
  quickReplies: [
    "Sayop ang spelling sa akong ngalan",
    "Murag sayop ang score",
    "Aduna koy pangutana sa akong tee time",
    "Pangutana bahin sa handicap",
  ],
  greeting:
    "Kumusta, ako si Teeo. Isulti ang imong concern sa imong kaugalingong pulong, ug ipaabot nako kini sa organizer.",
  fallback:
    "Dili ko makasulti karon. Gamita ang form nga naay tick boxes sa /feedback, ug basahon kini sa organizer.",
  fallbackTitle: "Gamita ang form",
  turnLimit:
    "Nisamot na kadugay ang panag-istorya. Ipadala ang nahabilin sa form sa /feedback aron walay mawala.",
  rateLimited:
    "Sobra na ka daghan ang mga mensahe karon. Paghulat og pila ka minuto, o gamita ang form sa /feedback.",
  submitSuccess: "Napadala na. Basahon kini sa organizer.",
  submitFailed: "Wala kini napadala. Sulayi pag-usab, o gamita ang form sa /feedback.",
  badRequest: "Dili ko mabasa ang mensahe. Sulayi pag-usab.",
  notReady: "Wala pa maabli ang inbox. Gamita lang ang form sa /feedback unya.",
  confirmPrompt: "Sakto ba kini?",
  readyToSend: "Kompleto na ang akong gikinahanglan. Tan-awa ang note sa ubos.",
  summaryTitle: "Ang imong note",
  confirm: "Kompirmaha ug ipadala",
  edit: "Usba",
  editHint: "Isulti kung unsa ang usbon, ug i-update nako ang note.",
  send: "Ipadala",
  sending: "Ginapadala",
  placeholder: "Isulti kang Teeo ang imong concern…",
  openLabel: "Pangutana ni Teeo",
  closeLabel: "Sirad-i ang chat",
  languageLabel: "Pinulongan",
  retry: "Sulayi pag-usab",
  notGiven: "Wala gihatag",
  questions: {
    concerns: "Unsa ang imong concern? Pwede ka mopili og labaw sa usa.",
    holeNo: "Asa nga hole number kini?",
    teeColour: "Asa nga tee ka nagdula? Blue, silver, white o red.",
    otherText: "Isulti gamay, sa imong kaugalingong pulong.",
    playerName: "Unsa ang ngalan sa imong entry?",
    handicap: "Unsa nga handicap ang isulat nako? Pwede nimo ingnon nga laktawi.",
    schedule: "Asa nga adlaw ug oras sa tee ang imong entry?",
  },
  fieldLabels: {
    concerns: "Concern",
    holeNo: "Hole",
    teeColour: "Tee",
    otherText: "Detalye",
    playerName: "Ngalan",
    handicap: "Handicap",
    schedule: "Iskedyul",
  },
  concernLabels: {
    inquiry: "Pangutana",
    name_typo: "Sayop ang ngalan",
    schedule: "Iskedyul",
    handicap: "Handicap",
    score: "Iskor",
    tee_off: "Tee off",
    other: "Uban pa",
  },
  teeLabels: { blue: "Asul", silver: "Pilak", white: "Puti", red: "Pula" },
};

export const CHAT_COPY: Record<ChatLocale, ChatCopy> = {
  en: EN,
  tl: TL,
  hil: HIL,
  ceb: CEB,
};

export function chatCopy(locale: ChatLocale): ChatCopy {
  return CHAT_COPY[locale];
}

/** A short line for the optional fields the player declined, used by the summary card. */
export function declinedLine(locale: ChatLocale, fields: readonly OptionalConcernField[]): string {
  if (fields.length === 0) return "";
  const copy = chatCopy(locale);
  return `${copy.notGiven}: ${fields.map((field) => copy.fieldLabels[field]).join(", ")}`;
}
