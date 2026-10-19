"use client";

import { TournamentCarousel } from "@/components/public/TournamentCarousel";
import { cutOffLabel, daysBetween, type PublicEvent } from "@/lib/public/highlights";

/**
 * Dev-only. Every state the open-events strip can be in, with fixed dates so it looks the same
 * whenever it is opened.
 *
 * It exists because the demo build only ever has one event open: the sample monthly medal's cut-off
 * was 17 Oct and today is later, so `public_open_events()` and its demo twin correctly exclude it and
 * the carousel's controls, wrapping and auto-advance have nothing to move between. This gives them
 * something, and it is the place to look when the strip changes.
 *
 * The entry links point at event ids that do not exist, so following one is a 404. That is fine here:
 * the preview is for looking at, and it never runs in a production build.
 */

const TODAY = "2026-10-19";

const events: PublicEvent[] = [
  {
    tournamentId: "preview-multi-day",
    name: "24th Bamboo Tee",
    dates: ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"],
    startFormat: "shotgun",
    firstTeeTime: "06:30",
    cutOffDate: "2026-11-01",
    entered: 87,
  },
  {
    tournamentId: "preview-urgent",
    name: "IGCC Monthly Medal",
    dates: ["2026-10-24"],
    startFormat: "two_tee",
    firstTeeTime: "07:00",
    cutOffDate: "2026-10-21",
    entered: 41,
  },
  {
    tournamentId: "preview-closes-today",
    name: "President's Cup",
    dates: ["2026-11-08"],
    startFormat: "shotgun",
    firstTeeTime: "06:00",
    cutOffDate: "2026-10-19",
    entered: 12,
  },
  {
    tournamentId: "preview-crosses-month",
    name: "Founders' Weekend",
    dates: ["2026-11-30", "2026-12-01", "2026-12-02"],
    startFormat: "two_tee",
    firstTeeTime: "08:15",
    cutOffDate: "2026-11-20",
    entered: 0,
  },
  {
    tournamentId: "preview-long-name",
    name: "Iloilo Golf & Country Club Invitational Amateur Championship",
    dates: ["2026-12-20", "2026-12-21"],
    startFormat: "shotgun",
    firstTeeTime: "06:45",
    cutOffDate: "2026-12-10",
    entered: 126,
  },
];

export default function CarouselPreview() {
  return (
    <main className="teeline-site" style={{ background: "#0e1613", minHeight: "100vh" }}>
      <section style={{ padding: "48px 0 8px" }}>
        <div
          style={{
            margin: "0 auto",
            width: "min(100%, 1240px)",
            padding: "0 clamp(24px,7vw,96px)",
          }}
        >
          <p
            style={{
              color: "#d8bd81",
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Dev only · strip states
          </p>
          <h1
            style={{ color: "#fffdf7", fontFamily: "var(--f-serif)", fontSize: 40, marginTop: 8 }}
          >
            Five events, so every state is reachable
          </h1>
        </div>
      </section>

      {/* The whole strip, with all five. */}
      <TournamentCarousel events={events} today={TODAY} />

      <section style={{ padding: "64px 0 96px" }}>
        <div
          style={{
            margin: "0 auto",
            width: "min(100%, 1240px)",
            padding: "0 clamp(24px,7vw,96px)",
            display: "grid",
            gap: 12,
          }}
        >
          <h2
            style={{
              color: "#f7f5ee",
              fontSize: 15,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            What to look for
          </h2>
          <ul
            style={{ color: "#cad7cf", fontSize: 14, lineHeight: 1.7, margin: 0, paddingLeft: 20 }}
          >
            <li>
              The cut-off line is emphasised for the two inside three days, and plain for the rest.
            </li>
            <li>“Closes today” for the one whose cut-off is today rather than “0 days”.</li>
            <li>“No entries yet” for the one with none, instead of “0 entered”.</li>
            <li>
              Both date forms: one month (“Nov 12–15”), two months (“Nov 30 – Dec 2”), one day (“Oct
              24”).
            </li>
            <li>A long event name wraps rather than overflowing.</li>
            <li>
              It advances on its own every seven seconds, pauses on hover and on focus, and stops
              entirely for reduced motion.
            </li>
          </ul>

          <h2
            style={{
              color: "#f7f5ee",
              fontSize: 15,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginTop: 24,
            }}
          >
            Countdowns, as of {TODAY}
          </h2>
          <ul
            style={{ color: "#cad7cf", fontSize: 14, lineHeight: 1.7, margin: 0, paddingLeft: 20 }}
          >
            {events.map((e) => (
              <li key={e.tournamentId}>
                {e.name}: {cutOffLabel(daysBetween(TODAY, e.cutOffDate))}
              </li>
            ))}
          </ul>

          <h2
            style={{
              color: "#f7f5ee",
              fontSize: 15,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginTop: 24,
            }}
          >
            Nothing open
          </h2>
          <p style={{ color: "#cad7cf", fontSize: 14, lineHeight: 1.7, margin: 0 }}>
            With no events the strip renders nothing at all, so the page simply does not have that
            section. The landing page calls it only when the list is not empty.
          </p>
        </div>
      </section>
    </main>
  );
}
