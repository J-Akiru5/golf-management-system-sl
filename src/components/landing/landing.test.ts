import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventCarousel, LandingHero } from "./index";
import { previewEvents, previewHero } from "./preview-data";

describe("landing visual components", () => {
  it("renders the clubs hero with its demo and product actions", () => {
    const html = renderToStaticMarkup(
      createElement(LandingHero, { ...previewHero, defaultView: "clubs" }),
    );

    expect(html).toContain('id="hero-title"');
    expect(html).toContain("A better desk for");
    expect(html).toContain("tournament day.");
    expect(html).toContain('role="tablist"');
    expect(html).toContain("Request a demo");
    expect(html).toContain('href="#product"');
  });

  it("renders the featured event, completion state, and quick actions", () => {
    const html = renderToStaticMarkup(createElement(LandingHero, previewHero));

    expect(html).toContain("24th Bamboo Tee");
    expect(html).toContain("Nov 12–15, 2026");
    expect(html).toContain("327 entered");
    expect(html).toContain("Completed");
    expect(html).toContain('href="/results/all"');
    expect(html).toContain("See all scores");
    expect(html).toContain('href="/pairings"');
    expect(html).toContain("View published pairings");
    expect(html).toContain('role="tab"');
  });

  it("renders live, upcoming, and completed carousel state chips and actions", () => {
    const [finished] = previewEvents;
    expect(finished).toBeDefined();
    const events = [
      {
        ...finished!,
        tournamentId: "live-event",
        name: "Live event",
        phase: "live" as const,
        finished: false,
      },
      {
        ...finished!,
        tournamentId: "upcoming-event",
        name: "Upcoming event",
        phase: "upcoming" as const,
        finished: false,
        entriesOpen: true,
      },
      finished!,
    ];
    const html = renderToStaticMarkup(createElement(EventCarousel, { events }));

    expect(html).toContain("Live");
    expect(html).toContain("Upcoming");
    expect(html).toContain("Completed");
    expect(html).toContain('href="/pairings"');
    expect(html).toContain('href="/results/all"');
    expect(html).toContain('href="/enter/upcoming-event"');
    expect(html).toContain('aria-label="Next event"');
  });
});
