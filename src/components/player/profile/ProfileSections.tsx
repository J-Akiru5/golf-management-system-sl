import type { ReactNode } from "react";

/**
 * The two presentational pieces the profile page repeats. They hold no data and no wording of their
 * own: the page passes the translated strings, so this file stays a layout helper.
 */

/** One card: a section with an h2 that names it and an optional line of context. */
export function ProfileCard({
  id,
  title,
  body,
  children,
}: {
  id: string;
  title: string;
  body?: string;
  children: ReactNode;
}) {
  return (
    <section className="card pf-card" aria-labelledby={id}>
      <h2 id={id} className="pf-card-title">
        {title}
      </h2>
      {body && <p className="pf-hint">{body}</p>}
      {children}
    </section>
  );
}

/** One term and its value, the row shape a club record reads best in. */
export function ProfileFact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="pf-fact">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
