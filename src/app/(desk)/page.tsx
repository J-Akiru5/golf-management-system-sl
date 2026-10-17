"use client";

import Link from "next/link";
import { StatusPill } from "@/components/bits";
import { validateDraw } from "@/lib/draw/validate";
import { useDesk } from "@/lib/store/desk-store";

export default function Overview() {
  const { state, registrations, names, isPublished, changedSincePublish } = useDesk();
  const ready = registrations.filter((r) => r.status === "ok").length;
  const review = registrations.filter((r) => r.status === "needs_review");
  const out = registrations.filter((r) => r.status === "ineligible");
  const attention = [...review, ...out];
  const drawn = state.draw !== null;
  const locked = state.draw?.filter((g) => g.locked).length ?? 0;

  const steps = [
    {
      label: "Load handicaps from NGAP",
      done: state.importedCount > 0,
      href: "/import",
      cta: "Import",
    },
    {
      label: `Register players (${registrations.length} added)`,
      done: registrations.length > 0,
      href: "/players",
      cta: "Players",
    },
    { label: "Make the draw", done: drawn, href: "/draw", cta: "Draw" },
    {
      label: `Check and lock groups (${locked} locked)`,
      done: drawn && locked > 0,
      href: "/draw",
      cta: "Review",
    },
    {
      label: "Publish pairings for players",
      done: state.published !== null,
      href: "/draw",
      cta: "Publish",
    },
  ];
  const next = steps.findIndex((s) => !s.done);
  const issues = state.draw
    ? validateDraw({
        draw: state.draw,
        registrations,
        config: state.config,
        engineWarnings: state.drawWarnings,
        names,
      })
    : [];
  const mustFix = issues.filter((i) => i.severity === "blocking").length;
  const toCheck = issues.filter((i) => i.severity === "warning").length;

  return (
    <div className="stack">
      <header className="stack" style={{ gap: ".35rem" }}>
        <p className="muted">Tournament</p>
        <h1>{state.name}</h1>
        <p className="muted">
          {new Date(`${state.config.date}T00:00:00`).toLocaleDateString("en-PH", {
            dateStyle: "full",
          })}
          {" · "}
          {state.config.startFormat === "shotgun" ? "Shotgun start" : "Two-tee start"}
          {" · "}max index {state.config.maxIndex}
        </p>
      </header>

      <section className="tiles" aria-label="Registration counts">
        <div className="tile">
          <b>{registrations.length}</b>
          <span>Players added</span>
        </div>
        <div className="tile">
          <b>{ready}</b>
          <span>Ready to play</span>
        </div>
        <div className="tile">
          <b>{review.length}</b>
          <span>Need review</span>
        </div>
        <div className="tile">
          <b>{out.length}</b>
          <span>Not eligible</span>
        </div>
      </section>

      {state.draw && (
        <section className="card stack tight" aria-label="Draw status">
          <div className="row between">
            <h2>Draw</h2>
            <Link className="btn small ghost" href="/draw">
              Open draw
            </Link>
          </div>
          <p>
            {state.draw.length} groups.{" "}
            {mustFix > 0 ? (
              <span className="pill bad">{mustFix} must fix before publishing</span>
            ) : toCheck > 0 ? (
              <span className="pill warn">{toCheck} to check</span>
            ) : (
              <span className="pill ok">No problems found</span>
            )}{" "}
            {!isPublished && <span className="pill info">Draft</span>}
            {isPublished && !changedSincePublish && <span className="pill ok">Published</span>}
            {isPublished && changedSincePublish && (
              <span className="pill warn">Published, with changes not yet published</span>
            )}
          </p>
        </section>
      )}

      <section className="stack" style={{ gap: ".75rem" }}>
        <h2>What to do next</h2>
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={s.label} className={`step${s.done ? " done" : ""}`}>
              <span className="hole" aria-hidden="true">
                {s.done ? "✓" : i + 1}
              </span>
              <span>{s.label}</span>
              <Link className={`btn small${i === next ? " gold" : " ghost"}`} href={s.href}>
                {s.cta}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {attention.length > 0 && (
        <section className="stack" style={{ gap: ".75rem" }}>
          <h2>Needs your attention</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Status</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {attention.slice(0, 6).map((r) => (
                  <tr key={r.playerId}>
                    <td>{r.playerName}</td>
                    <td>
                      <StatusPill status={r.status} />
                    </td>
                    <td>{r.reasons.join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
