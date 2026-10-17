"use client";

import { DEMO_CATEGORIES, DEMO_FLIGHTS, DEMO_TEES } from "@/lib/demo/data";
import type { StartFormat, TournamentConfig } from "@/lib/routing";
import { useDesk } from "@/lib/store/desk-store";

export default function SetupPage() {
  const { state, names, dispatch } = useDesk();
  const c = state.config;
  const set = (patch: Partial<TournamentConfig>) => dispatch({ type: "setConfig", config: patch });
  const num = (v: string) => (v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

  return (
    <div className="stack">
      <header>
        <h1>Setup</h1>
        <p className="muted">Rules for this tournament. Changes update every player right away.</p>
      </header>

      <section className="card stack">
        <h2>Tournament</h2>
        <div className="form-grid">
          <label className="field">
            <span>Date of play</span>
            <input
              type="date"
              value={c.date}
              onChange={(e) => e.target.value && set({ date: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Start format</span>
            <select
              value={c.startFormat}
              onChange={(e) => set({ startFormat: e.target.value as StartFormat })}
            >
              <option value="shotgun">Shotgun (all start together)</option>
              <option value="two_tee">Two-tee start (holes 1 and 10)</option>
            </select>
          </label>
          <label className="field">
            <span>First tee time</span>
            <input
              type="time"
              value={c.firstTeeTime}
              onChange={(e) => e.target.value && set({ firstTeeTime: e.target.value })}
            />
          </label>
          {c.startFormat === "two_tee" ? (
            <label className="field">
              <span>Minutes between groups</span>
              <input
                type="number"
                min={5}
                max={30}
                value={c.intervalMinutes}
                onChange={(e) => {
                  const n = num(e.target.value);
                  if (n && n > 0) set({ intervalMinutes: n });
                }}
              />
            </label>
          ) : (
            <label className="field">
              <span>Minutes until the second wave</span>
              <input
                type="number"
                min={60}
                max={600}
                step={15}
                value={c.waveGapMinutes}
                onChange={(e) => {
                  const n = num(e.target.value);
                  if (n && n > 0) set({ waveGapMinutes: n });
                }}
              />
              <span className="hint">300 minutes = 5 hours after the first wave.</span>
            </label>
          )}
          <label className="field">
            <span>Highest index allowed</span>
            <input
              type="number"
              min={0}
              max={54}
              step={0.1}
              value={c.maxIndex}
              onChange={(e) => {
                const n = num(e.target.value);
                if (n !== null) set({ maxIndex: n });
              }}
            />
          </label>
          <label className="field">
            <span>Handicap allowance (%)</span>
            <input
              type="number"
              min={50}
              max={100}
              value={Math.round(c.allowance * 100)}
              onChange={(e) => {
                const n = num(e.target.value);
                if (n && n >= 50 && n <= 100) set({ allowance: n / 100 });
              }}
            />
          </label>
          <label className="field">
            <span>Flights are set by</span>
            <select
              value={c.flightBasis}
              onChange={(e) =>
                set({ flightBasis: e.target.value as TournamentConfig["flightBasis"] })
              }
            >
              <option value="index">Handicap index</option>
              <option value="courseHandicap">Course handicap</option>
            </select>
          </label>
          <label className="field">
            <span>Players per group (most)</span>
            <select
              value={c.groupSize}
              onChange={(e) => set({ groupSize: Number(e.target.value) })}
            >
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="stack" style={{ gap: ".6rem" }}>
        <h2>Categories</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Who plays</th>
                <th>Age</th>
                <th>Tee</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_CATEGORIES.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td>{k.gender === "M" ? "Men" : k.gender === "F" ? "Women" : "Everyone"}</td>
                  <td className="mono">
                    {k.maxAge === null ? `${k.minAge}+` : `${k.minAge}–${k.maxAge}`}
                  </td>
                  <td>{names.tee(k.teeId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack" style={{ gap: ".6rem" }}>
        <h2>Flights</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Flight</th>
                <th>Category</th>
                <th className="num">From</th>
                <th className="num">To</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_FLIGHTS.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td>{names.category(f.categoryId)}</td>
                  <td className="num mono">{f.min <= -10 ? "plus" : f.min}</td>
                  <td className="num mono">{f.max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack" style={{ gap: ".6rem" }}>
        <h2>Tees</h2>
        <div className="notice warn" role="note">
          These ratings are placeholders. Enter IGCC's real Course Rating, Slope and Par for every
          tee from the club scorecard before running a real event. Wrong numbers give wrong playing
          handicaps.
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tee</th>
                <th className="num">Course rating</th>
                <th className="num">Slope</th>
                <th className="num">Par</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_TEES.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="num mono">{t.courseRating}</td>
                  <td className="num mono">{t.slope}</td>
                  <td className="num mono">{t.par}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
