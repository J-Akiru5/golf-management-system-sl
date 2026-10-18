import { DEMO_CATEGORIES, DEMO_FLIGHTS, DEMO_TEES } from "@/lib/demo/data";
import type { CategoryRule, FlightRule, Tee } from "@/lib/routing";

/**
 * What a club's first event starts from when it has no tees, categories or flights saved yet: the
 * categories and tee names the organizer confirmed on 17 Oct 2026, with the flight ranges and tee
 * numbers still to be replaced. The numbers are samples, so a new event is *not* marked as
 * confirmed and every printed sheet carries the placeholder watermark until the organizer enters
 * the club scorecard and confirms it in Settings.
 *
 * Returned as fresh copies so an edit can never reach the shared demo constants.
 */
export function starterSetup(): { tees: Tee[]; categories: CategoryRule[]; flights: FlightRule[] } {
  return {
    tees: DEMO_TEES.map((t) => ({ ...t })),
    categories: DEMO_CATEGORIES.map((c) => ({ ...c })),
    flights: DEMO_FLIGHTS.map((f) => ({ ...f })),
  };
}
