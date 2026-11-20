/**
 * Landing page components. STUBS: the design builder replaces each body with the real component and
 * keeps every export name and props type exactly as written here (see ./types.ts). The page and the
 * data layer compose these without knowing how they look.
 */
import type {
  EventCarouselProps,
  LandingFooterProps,
  LandingHeroProps,
  ProductShot,
  ProofStripProps,
} from "./types";

export type * from "./types";

/** Nav, the For clubs / Now hosting switch, both hero sides, quick actions and the event stats. */
export function LandingHero(props: LandingHeroProps) {
  return (
    <section aria-labelledby="hero-title">
      <h1 id="hero-title">{props.featured?.name ?? "TeeLine Golf"}</h1>
    </section>
  );
}

/** The real admin screens, shown in perspective. */
export function ProductShowcase({ shots }: { shots: ProductShot[] }) {
  return (
    <section aria-label="The TeeLine desk">
      {shots.map((shot) => (
        <figure key={shot.src}>
          <figcaption>{shot.caption}</figcaption>
        </figure>
      ))}
    </section>
  );
}

/** Numbers from the 24th Bamboo Tee. */
export function ProofStrip({ stats, source }: ProofStripProps) {
  return (
    <section aria-label="In use">
      {stats.map((stat) => (
        <p key={stat.label}>
          {stat.value} {stat.label}
        </p>
      ))}
      <p>{source}</p>
    </section>
  );
}

/** What TeeLine does, section by section. Static copy, written in the component. */
export function CapabilitySections() {
  return <section aria-label="What TeeLine does" />;
}

/** The club's events, live first, finished ones marked Completed. */
export function EventCarousel({ events }: EventCarouselProps) {
  return (
    <section aria-label="Events">
      {events.map((event) => (
        <p key={event.tournamentId}>{event.name}</p>
      ))}
    </section>
  );
}

/** The closing Request a demo band. Links to /demo. */
export function DemoCta() {
  return (
    <section aria-label="Request a demo">
      <a href="/demo">Request a demo</a>
    </section>
  );
}

export function LandingFooter({ versionLabel }: LandingFooterProps) {
  return <footer>{versionLabel}</footer>;
}
