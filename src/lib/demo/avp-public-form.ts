/**
 * AVP THROWAWAY BRANCH ONLY.
 *
 * In demo mode the public entry form normally shows a "connect Supabase" notice, because a demo
 * build has nowhere to write an entry. The onboarding video needs to show the real form, so this
 * module supplies a sample configuration with no database behind it. The submit handler on the page
 * returns a demo message and writes nothing.
 */
import type { RegistrationFormConfig } from "@/lib/data/supabase/public-registration";
import { makeDemoTournaments } from "./data";

const tournament = makeDemoTournaments().find((t) => t.id === "bamboo-tee-2026");
if (!tournament) throw new Error("the demo seed has no Bamboo Tee event");

const registration = tournament.registration;

export const DEMO_PUBLIC_FORM: RegistrationFormConfig = {
  tournamentId: tournament.id,
  name: "Bamboo Tee (sample event)",
  dates: tournament.dates,
  cutOffDate: tournament.cutOffDate,
  isOpen: true,
  shirtSizes: registration.shirtSizes,
  teeTimes: registration.teeTimes,
  fields: registration.fields.map((field) => ({
    id: field.id,
    label: field.label,
    type: field.type,
    options: field.options,
    required: field.required,
    appliesTo: field.appliesTo,
    help: field.help,
  })),
  sponsorQuestion: registration.sponsorQuestion,
  instructions: "Sample event for the demo. No entry is sent anywhere.",
  payment: registration.payment,
};
