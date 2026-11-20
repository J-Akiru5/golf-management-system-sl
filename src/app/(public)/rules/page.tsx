import { redirect } from "next/navigation";
import { loadEventArchive } from "@/lib/data/supabase/event-archive";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { todayInManila } from "../events/_lib/today";

/**
 * The old rules address.
 *
 * Rules of play belong to one event now, so `/rules` is kept working as a doorway: it sends the
 * visitor to the featured event's rules when the organizer featured one and it has rules, otherwise
 * to the newest event that has rules, otherwise to the portfolio. The page is not in the nav any
 * more; the event page's `#rules` section is where the text lives.
 *
 * Read per request rather than at build time: which event is featured changes in the desk, and a
 * redirect cached from a build would send visitors to the wrong event.
 */
export const dynamic = "force-dynamic";

export default async function RulesRedirectPage() {
  if (isSupabaseConfigured()) {
    const today = todayInManila();
    const events =
      (await loadEventArchive(createSupabasePublicClient(), today).catch(() => null)) ?? [];
    const withRules = events.filter((event) => event.hasRules);
    const featured = withRules.find((event) => event.featured);
    const target = featured ?? withRules[0];
    if (target) redirect(`/events/${target.tournamentId}#rules`);
  }
  redirect("/events");
}
