/**
 * The public registration form's data access.
 *
 * Both calls go through SECURITY DEFINER functions, so a visitor never touches a club table and
 * never needs an account. The form's configuration is public-safe (no player data), and a
 * submission always lands as `needs_review` for the desk to confirm.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

export interface FormDay {
  day: number;
  label: string;
  date: string;
  options: string[];
  needsConfirmation: boolean;
}

/** One actual playing day offered by the event. The day number is what the server stores. */
export interface FormPlayingDay {
  dayNumber: number;
  playDate: string;
  label: string;
  startTime: string | null;
}

export interface FormField {
  id: string;
  label: string;
  type: "text" | "select" | "number" | "checkbox";
  options: string[];
  required: boolean;
  appliesTo: "member" | "guest" | "both";
  help: string | null;
}

export interface FormPayment {
  method: string;
  bank: string;
  accountName: string;
  accountNumber: string;
  note: string;
}

export interface RegistrationFormConfig {
  tournamentId: string;
  name: string;
  dates: string[];
  cutOffDate: string;
  isOpen: boolean;
  shirtSizes: string[];
  teeTimes: FormDay[];
  days: FormPlayingDay[];
  requiredDays: number | null;
  maxDays: number | null;
  fields: FormField[];
  sponsorQuestion: string;
  instructions: string | null;
  payment: FormPayment | null;
}

export interface SubmissionPlayer {
  name: string;
  firstName?: string;
  lastName?: string;
  birthdate: string;
  gender: "M" | "F";
  ngapId?: string;
  contactNumber?: string;
  homeCourse?: string;
  email?: string;
}

export interface SubmissionAnswers {
  role: "member" | "guest";
  sponsor: boolean | null;
  shirt: string | null;
  teePreferences: Record<string, string | null>;
  /** Tournament day numbers chosen by the player. */
  days: number[];
  declaredWshId: string | null;
  declaredWshHandicap: string | null;
  extra: Record<string, string>;
}

export interface SubmissionResult {
  ok: boolean;
  code: "accepted" | "invalid" | "closed" | "duplicate" | "ambiguous" | "not_found" | "error";
  message: string;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function parseFormConfig(value: Json): RegistrationFormConfig | null {
  const raw = record(value);
  if (typeof raw.tournamentId !== "string") return null;
  const payment = record(raw.payment);
  return {
    tournamentId: raw.tournamentId,
    name: typeof raw.name === "string" ? raw.name : "Tournament",
    dates: strings(raw.dates),
    cutOffDate: typeof raw.cutOffDate === "string" ? raw.cutOffDate : "",
    isOpen: raw.isOpen === true,
    shirtSizes: strings(raw.shirtSizes),
    days: (Array.isArray(raw.days) ? raw.days : [])
      .map((day) => {
        const d = record(day);
        return {
          dayNumber: typeof d.dayNumber === "number" ? d.dayNumber : 0,
          playDate: typeof d.playDate === "string" ? d.playDate : "",
          label: typeof d.label === "string" ? d.label : "",
          startTime: typeof d.startTime === "string" ? d.startTime : null,
        };
      })
      .filter((day) => day.dayNumber > 0 && day.playDate !== ""),
    requiredDays: typeof raw.requiredDays === "number" ? raw.requiredDays : null,
    maxDays: typeof raw.maxDays === "number" ? raw.maxDays : null,
    teeTimes: (Array.isArray(raw.teeTimes) ? raw.teeTimes : []).map((day) => {
      const d = record(day);
      return {
        day: typeof d.day === "number" ? d.day : 0,
        label: typeof d.label === "string" ? d.label : "",
        date: typeof d.date === "string" ? d.date : "",
        options: strings(d.options),
        needsConfirmation: d.needsConfirmation === true,
      };
    }),
    fields: (Array.isArray(raw.fields) ? raw.fields : []).map((field) => {
      const f = record(field);
      const type = typeof f.type === "string" ? f.type : "text";
      return {
        id: typeof f.id === "string" ? f.id : "",
        label: typeof f.label === "string" ? f.label : "",
        type:
          type === "select" || type === "number" || type === "checkbox"
            ? (type as FormField["type"])
            : "text",
        options: strings(f.options),
        required: f.required === true,
        appliesTo:
          f.appliesTo === "member" || f.appliesTo === "guest"
            ? (f.appliesTo as FormField["appliesTo"])
            : "both",
        help: typeof f.help === "string" ? f.help : null,
      };
    }),
    sponsorQuestion: typeof raw.sponsorQuestion === "string" ? raw.sponsorQuestion : "",
    instructions: typeof raw.instructions === "string" ? raw.instructions : null,
    payment: Object.keys(payment).length
      ? {
          method: typeof payment.method === "string" ? payment.method : "",
          bank: typeof payment.bank === "string" ? payment.bank : "",
          accountName: typeof payment.accountName === "string" ? payment.accountName : "",
          accountNumber: typeof payment.accountNumber === "string" ? payment.accountNumber : "",
          note: typeof payment.note === "string" ? payment.note : "",
        }
      : null,
  };
}

export function parseSubmissionResult(value: Json): SubmissionResult {
  const raw = record(value);
  const code = typeof raw.code === "string" ? raw.code : "error";
  return {
    ok: raw.ok === true,
    code: ["accepted", "invalid", "closed", "duplicate", "ambiguous", "not_found"].includes(code)
      ? (code as SubmissionResult["code"])
      : "error",
    message:
      typeof raw.message === "string"
        ? raw.message
        : "The entry could not be sent. Please try again.",
  };
}

export async function loadRegistrationForm(
  client: SupabaseClient<Database>,
  tournamentId: string,
): Promise<RegistrationFormConfig | null> {
  const { data, error } = await client.rpc("public_registration_form", {
    p_tournament: tournamentId,
  });
  if (error) throw new Error(`Could not load the entry form: ${error.message}`);
  return data ? parseFormConfig(data as Json) : null;
}

export async function submitRegistration(
  client: SupabaseClient<Database>,
  tournamentId: string,
  player: SubmissionPlayer,
  answers: SubmissionAnswers,
): Promise<SubmissionResult> {
  const { data, error } = await client.rpc("submit_registration", {
    p_tournament: tournamentId,
    p_player: player as unknown as Json,
    p_answers: answers as unknown as Json,
  });
  if (error) {
    return { ok: false, code: "error", message: `The entry could not be sent: ${error.message}` };
  }
  return parseSubmissionResult((data ?? {}) as Json);
}
