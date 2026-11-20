import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventCarousel, LandingHero } from "./index";
import { previewEvents, previewHero } from "./preview-data";

describe("landing visual components", () => {
  it("renders the centered club hero without a visitor-facing switch", () => {
    const html = renderToStaticMarkup(createElement(LandingHero, previewHero));

    expect(html).toContain('id="hero-title"');
    expect(html).toContain("A better desk for");
    expect(html).toContain("tournament day.");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
    expect(html).toContain("Request a demo");
    expect(html).toContain('href="#product"');
    expect(html).toContain("data-tl-tilt");
    expect(html).toContain("data-tl-draw");
  });

  it("renders the hosting pill and featured band with completion state and quick actions", () => {
    const html = renderToStaticMarkup(createElement(LandingHero, previewHero));

    expect(html).toContain("24th Bamboo Tee");
    expect(html).toContain("Now hosting");
    expect(html).toContain("tl-featured-band");
    expect(html).toContain("Nov 12–15, 2026");
    expect(html).toContain("327 entered");
    expect(html).toContain("Completed");
    expect(html).toContain('href="/results/all"');
    expect(html).toContain("See all scores");
    expect(html).toContain('href="/pairings"');
    expect(html).toContain("View published pairings");
  });

  it("omits the hosting pill and featured band when there is no featured event", () => {
    const html = renderToStaticMarkup(
      createElement(LandingHero, {
        ...previewHero,
        featured: null,
        quickActions: [],
        eventStats: [],
      }),
    );

    expect(html).not.toContain("Now hosting");
    expect(html).not.toContain("tl-featured-band");
    expect(html).not.toContain('role="tablist"');
  });

  it("renders a single event as a feature card without carousel controls", () => {
    const [event] = previewEvents;
    expect(event).toBeDefined();
    const html = renderToStaticMarkup(createElement(EventCarousel, { events: [event!] }));

    expect(html).toContain("is-feature");
    expect(html).toContain("Playing days");
    expect(html).toContain("Completed");
    expect(html).not.toContain('aria-live="polite"');
    expect(html).not.toContain('aria-label="Previous event"');
    expect(html).not.toContain('aria-label="Next event"');
    expect(html).toContain('href="/results/all"');
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
