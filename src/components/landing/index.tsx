import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { EventCarousel } from "./EventCarousel";
import { LandingHero } from "./LandingHero";
import "./landing.css";
import type { LandingFooterProps, ProductShot, ProofStripProps } from "./types";

export type * from "./types";
export { EventCarousel, LandingHero };

/** The real admin screens, shown in perspective. */
export function ProductShowcase({ shots }: { shots: ProductShot[] }) {
  const remainingShots = shots.slice(1);
  return (
    <section className="tl-product tl-section" id="product" aria-labelledby="tl-product-title">
      <div className="tl-section-heading" data-tl-reveal>
        <p className="tl-kicker">Inside the desk</p>
        <h2 id="tl-product-title">A clear view of tournament day.</h2>
      </div>
      {remainingShots.length > 0 && (
        <div className="tl-product-secondary" data-tl-stagger>
          {remainingShots.map((shot) => (
            <figure key={shot.src}>
              <Image
                src={shot.src}
                alt={shot.alt}
                width={shot.width}
                height={shot.height}
                sizes="(max-width: 700px) 100vw, 50vw"
                loading="lazy"
              />
              <figcaption>{shot.caption}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}

/** Numbers from the 24th Bamboo Tee. */
export function ProofStrip({ stats, source }: ProofStripProps) {
  return (
    <section className="tl-proof tl-section" id="proof" aria-labelledby="tl-proof-title">
      <div className="tl-proof-heading" data-tl-reveal>
        <p className="tl-kicker">A tournament, in the desk</p>
        <h2 id="tl-proof-title">The work stays in view.</h2>
      </div>
      <div className="tl-proof-grid" data-tl-stagger>
        {stats.map((stat) => (
          <article className="tl-proof-card" key={stat.label} data-tl-reveal>
            <p
              className="tl-proof-value"
              data-tl-count={stat.value.replace(/[^\d.]/g, "") || undefined}
            >
              {stat.value}
            </p>
            <h3>{stat.label}</h3>
            <p className="tl-proof-detail">{stat.detail}</p>
          </article>
        ))}
      </div>
      <p className="tl-proof-source">{source}</p>
    </section>
  );
}

/** What TeeLine does, section by section. Static copy, written in the component. */
export function CapabilitySections() {
  return (
    <section
      className="tl-capabilities tl-section"
      id="how-it-works"
      aria-labelledby="tl-capabilities-title"
    >
      <div className="tl-section-heading tl-capabilities-intro" data-tl-reveal>
        <p className="tl-kicker">From entry to result</p>
        <h2 id="tl-capabilities-title">The tournament, under one roof.</h2>
        <p>
          Set the rules for each event. TeeLine works out the draw, then leaves the decisions with
          the organizer.
        </p>
      </div>
      <article className="tl-capability" data-tl-reveal>
        <div className="tl-capability-copy">
          <span className="tl-index">01 / Prepare</span>
          <h3>Bring the field together.</h3>
          <p>
            Take entries at the desk or online, then import handicap indexes. Each player’s
            category, tee, flight, group and start slot follows that tournament’s settings.
          </p>
          <p>
            When the rules cannot place someone, TeeLine flags the entry for review instead of
            guessing.
          </p>
        </div>
        <div className="tl-diagram tl-routing-diagram" aria-label="Entry, settings, review">
          <span>Entries</span>
          <b aria-hidden="true">→</b>
          <span>Event settings</span>
          <b aria-hidden="true">→</b>
          <span className="tl-diagram-result">Reviewable draw</span>
        </div>
      </article>
      <article className="tl-capability tl-capability-reverse" data-tl-reveal>
        <div className="tl-capability-copy">
          <span className="tl-index">02 / Review</span>
          <h3>The organizer stays in control.</h3>
          <p>
            Choose shotgun or tee-time starts. Review the proposed groups, fix anything flagged, and
            publish when the draw is ready.
          </p>
          <p>
            Players can open published pairings on a phone without an account. Private profile
            details stay private.
          </p>
        </div>
        <div
          className="tl-diagram tl-draw-diagram"
          aria-label="A reviewed draw progresses to published pairings"
        >
          <div>
            <span>Draft draw</span>
            <i />
            <i />
            <i />
          </div>
          <b aria-hidden="true">→</b>
          <div className="tl-diagram-result">
            <span>Published</span>
            <i />
            <i />
            <i />
          </div>
        </div>
      </article>
      <article className="tl-capability" data-tl-reveal>
        <div className="tl-capability-copy">
          <span className="tl-index">03 / Play</span>
          <h3>Keep the round moving.</h3>
          <p>
            Enter scores hole by hole and check them against the card. A live public leaderboard can
            use a results blackout and timed reveal.
          </p>
          <p>
            Show the board in the clubhouse, print start sheets and scorecards, and keep an audit
            log of changes. The staff app supports marshals and tabulators.
          </p>
        </div>
        <div
          className="tl-diagram tl-score-diagram"
          aria-label="Score entry checked against a card"
        >
          <div>
            <span>Hole</span>
            <span>Par</span>
            <span>Score</span>
            <b>07</b>
            <b>4</b>
            <b>5</b>
            <b>08</b>
            <b>3</b>
            <b>3</b>
          </div>
          <span className="tl-diagram-caption">Checked against the card</span>
        </div>
      </article>
      <p className="tl-built-note">
        Built in Iloilo by Syntaxure Labs · First run at Iloilo Golf and Country Club
      </p>
    </section>
  );
}

/** The closing Request a demo band. Links to /demo. */
export function DemoCta() {
  return (
    <section className="tl-demo-cta" aria-labelledby="tl-demo-title" data-tl-reveal>
      <div>
        <p className="tl-kicker">For your tournament committee</p>
        <h2 id="tl-demo-title">See the desk at work.</h2>
        <p>Bring your tournament workflow. We’ll show you how it fits.</p>
      </div>
      <div className="tl-demo-actions">
        <Link className="tl-button tl-button-light" href="/demo">
          Request a demo <ChevronRight aria-hidden="true" />
        </Link>
        <p>
          Already a TeeLine club? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </section>
  );
}

export function LandingFooter({ versionLabel }: LandingFooterProps) {
  return (
    <footer className="tl-footer">
      <div className="tl-footer-grid">
        <div className="tl-footer-brand">
          <Link href="/" aria-label="TeeLine Golf home">
            <TeeLineLogo variant="reverse" width={168} />
          </Link>
          <p className="tl-powered">
            Powered by{" "}
            <Image
              src="/partners/converge-logo.svg"
              alt="Converge"
              width={104}
              height={24}
              sizes="104px"
              loading="lazy"
            />
          </p>
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <Link href="/pairings">Published pairings</Link>
          <Link href="/rules">Tournament rules</Link>
          <Link href="/leaderboard">Public leaderboard</Link>
          <Link href="/demo">Request a demo</Link>
        </nav>
        <div>
          <h2>Club</h2>
          <p>Iloilo Golf and Country Club</p>
        </div>
        <nav aria-label="Legal">
          <h2>Legal</h2>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
      <div className="tl-footer-bar">
        <p>Developed by Syntaxure Labs · {versionLabel}</p>
        <Link href="/login">Sign in</Link>
      </div>
    </footer>
  );
}
