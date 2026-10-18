"use client";

import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Flag,
  Layers,
  ListPlus,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { EntryLinkCard } from "@/components/public/EntryLinkCard";
import { Button } from "@/components/ui/button";
import { checkTournament } from "@/lib/data/config-checks";
import type { Hole, RegistrationField, Tournament, TournamentRegistration } from "@/lib/data/types";
import type { CategoryRule, FlightRule, StartFormat, Tee, TournamentConfig } from "@/lib/routing";
import { useDesk } from "@/lib/store/desk-store";
import { cn } from "@/lib/ui/cn";

const SECTIONS = [
  ["basics", "Basics"],
  ["course", "Course & tees"],
  ["rules", "Cut-off & handicap"],
  ["categories", "Categories"],
  ["flights", "Flights"],
  ["start", "Start & groups"],
  ["fields", "Registration fields"],
  ["review", "Review & readiness"],
] as const;

export default function SetupPage() {
  const { tournament, tees, holes, adapters } = useDesk();
  if (!tournament) return <NeedsTournament what="Settings" />;
  return (
    <SetupWizard
      tournament={tournament}
      tees={tees}
      holes={holes}
      // The whole setup goes through one write, so a half-saved setup cannot land.
      save={(next, nextTees, nextHoles) =>
        adapters.setup.save({ tournament: next, tees: nextTees, holes: nextHoles })
      }
    />
  );
}

function SetupWizard({
  tournament,
  tees,
  holes,
  save,
}: {
  tournament: Tournament;
  tees: ReturnType<typeof useDesk>["tees"];
  holes: ReturnType<typeof useDesk>["holes"];
  save: (
    t: Tournament,
    tees: ReturnType<typeof useDesk>["tees"],
    holes: ReturnType<typeof useDesk>["holes"],
  ) => void;
}) {
  // Tees and holes are edited locally and saved with the tournament, so one write carries the whole
  // setup. They are seeded from the loaded desk and re-seeded when it changes.
  const [draftTees, setDraftTees] = useState(tees);
  const [draftHoles, setDraftHoles] = useState(holes);
  useEffect(() => setDraftTees(tees), [tees]);
  useEffect(() => setDraftHoles(holes), [holes]);

  const update = (patch: Partial<Tournament>) =>
    save({ ...tournament, ...patch }, draftTees, draftHoles);
  const updateConfig = (patch: Partial<TournamentConfig>) =>
    update({ config: { ...tournament.config, ...patch } });
  const updateRegistration = (patch: Partial<TournamentRegistration>) =>
    update({ registration: { ...tournament.registration, ...patch } });

  // Ratings and stroke index only: a tee's name is what a category points at, and a hole's number is
  // its identity, so neither is editable here.
  const updateTee = (id: string, patch: Partial<Tee>) => {
    const next = draftTees.map((t) => (t.id === id ? { ...t, ...patch } : t));
    setDraftTees(next);
    save(tournament, next, draftHoles);
  };
  const updateHole = (number: number, patch: Partial<Hole>) => {
    const next = draftHoles.map((h) => (h.number === number ? { ...h, ...patch } : h));
    setDraftHoles(next);
    save(tournament, draftTees, next);
  };

  const checks = checkTournament(tournament, tees, holes);
  const bad = checks.filter((c) => c.level === "bad").length;
  const warn = checks.filter((c) => c.level === "warn").length;

  const num = (v: string) => (v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  const setCategory = (id: string, patch: Partial<CategoryRule>) =>
    update({
      categories: tournament.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  const setFlight = (id: string, patch: Partial<FlightRule>) =>
    update({ flights: tournament.flights.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const setField = (id: string, patch: Partial<RegistrationField>) =>
    updateRegistration({
      fields: tournament.registration.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });

  const idOf = (prefix: string) => `${prefix}-${Date.now().toString(36)}`;

  return (
    <div className="grid gap-6">
      <PageHeader
        overline="Settings & configuration"
        title="Tournament setup"
        crumbs={[{ label: tournament.name, href: "/tournaments" }, { label: "Settings" }]}
        actions={
          <span className={cn("pill", bad > 0 ? "bad" : warn > 0 ? "warn" : "ok")}>
            {bad > 0 ? `${bad} must fix` : warn > 0 ? `${warn} to check` : "Ready to publish"}
          </span>
        }
      >
        Every rule here is a setting for this event, not a fixed law. Changes apply to the demo
        board immediately and live in this browser session only.
      </PageHeader>

      <nav aria-label="Setup sections" className="flex flex-wrap gap-2">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="inline-flex h-9 items-center rounded-full border border-line-strong bg-surface-raised px-3.5 text-[13px] font-medium text-ink no-underline hover:bg-surface-sunken"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-6">
          <SectionCard id="basics" icon={<SlidersHorizontal />} title="Basics">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="field sm:col-span-2">
                <span>Event name</span>
                <input
                  type="text"
                  value={tournament.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>First day of play</span>
                <input
                  type="date"
                  value={tournament.dates[0] ?? ""}
                  onChange={(e) => {
                    const first = e.target.value;
                    if (!first) return;
                    const rest = tournament.dates.slice(1);
                    update({
                      dates: [first, ...rest],
                      config: { ...tournament.config, date: first },
                    });
                  }}
                />
              </label>
              <label className="field">
                <span>Registered state</span>
                <select
                  value={tournament.state}
                  onChange={(e) => update({ state: e.target.value as Tournament["state"] })}
                >
                  <option value="draft">Draft</option>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
            </div>
            <label className="check text-[14px]">
              <input
                type="checkbox"
                checked={tournament.nameNeedsConfirmation}
                onChange={(e) => update({ nameNeedsConfirmation: e.target.checked })}
              />
              <span>
                The event name still needs the organizer's confirmation. It is shown with a caution
                note until this is unticked.
              </span>
            </label>
            <p className="hint">
              Days of play: {tournament.dates.join(", ") || "none set"}. Age and cut-off are read on
              the first day until the club says which day counts. This is an open question.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  update({
                    dates: [...tournament.dates, tournament.dates.at(-1) ?? tournament.config.date],
                  })
                }
              >
                <Plus aria-hidden="true" /> Add a day
              </Button>
              {tournament.dates.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => update({ dates: tournament.dates.slice(0, -1) })}
                >
                  <Trash2 aria-hidden="true" /> Remove the last day
                </Button>
              )}
            </div>
          </SectionCard>

          <SectionCard
            id="course"
            icon={<Flag />}
            title="Course & tees"
            subtitle="Pending blocks. Nothing here is IGCC's real scorecard data yet."
          >
            <div className="notice warn flex items-start gap-2.5" role="note">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <p className="text-[13px]">
                <b>Enter IGCC&rsquo;s real numbers from the club scorecard.</b> Course Rating,
                Slope, Par and stroke index come from the card, not from this app. What is on screen
                now is sample data until the desk replaces it, and every edit here is written with
                the event setup in one go.
              </p>
            </div>
            <div className="table-wrap !shadow-none">
              <table>
                <thead>
                  <tr>
                    <th>Tee</th>
                    <th className="num">Course rating</th>
                    <th className="num">Slope</th>
                    <th className="num">Par</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {draftTees.map((t) => (
                    <tr key={t.id}>
                      <td className="font-semibold">{t.name}</td>
                      <td className="num">
                        <input
                          type="number"
                          step="0.1"
                          min="50"
                          max="90"
                          aria-label={`${t.name} course rating`}
                          value={t.courseRating}
                          onChange={(e) => {
                            const n = num(e.target.value);
                            if (n !== null) updateTee(t.id, { courseRating: n });
                          }}
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          min="55"
                          max="155"
                          aria-label={`${t.name} slope`}
                          value={t.slope}
                          onChange={(e) => {
                            const n = num(e.target.value);
                            if (n !== null) updateTee(t.id, { slope: n });
                          }}
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          min="27"
                          max="80"
                          aria-label={`${t.name} par`}
                          value={t.par}
                          onChange={(e) => {
                            const n = num(e.target.value);
                            if (n !== null) updateTee(t.id, { par: n });
                          }}
                        />
                      </td>
                      <td>
                        <span className="pill warn">Sample</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">
              {draftHoles.length} holes on file. Par and stroke index per hole:{" "}
              {draftHoles.every((h) => h.par !== null && h.strokeIndex !== null)
                ? "entered"
                : "not entered yet. Scorecards print placeholders and say so."}
            </p>
            {draftHoles.length > 0 && (
              <div className="table-wrap !shadow-none">
                <table>
                  <thead>
                    <tr>
                      <th className="num">Hole</th>
                      <th className="num">Par</th>
                      <th className="num">Stroke index</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftHoles.map((h) => (
                      <tr key={h.number}>
                        <td className="num mono">{h.number}</td>
                        <td className="num">
                          <input
                            type="number"
                            min="3"
                            max="6"
                            aria-label={`Hole ${h.number} par`}
                            value={h.par ?? ""}
                            onChange={(e) => {
                              const n = num(e.target.value);
                              if (n !== null) updateHole(h.number, { par: n });
                            }}
                          />
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            min="1"
                            max={draftHoles.length}
                            aria-label={`Hole ${h.number} stroke index`}
                            value={h.strokeIndex ?? ""}
                            onChange={(e) => {
                              const n = num(e.target.value);
                              if (n !== null) updateHole(h.number, { strokeIndex: n });
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard id="rules" icon={<CalendarClock />} title="Cut-off & handicap">
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              <label className="field">
                <span>Index cut-off date</span>
                <input
                  type="date"
                  value={tournament.cutOffDate}
                  onChange={(e) => e.target.value && update({ cutOffDate: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Highest index allowed</span>
                <input
                  type="number"
                  min={0}
                  max={54}
                  step={0.1}
                  value={tournament.config.maxIndex}
                  onChange={(e) => {
                    const n = num(e.target.value);
                    if (n !== null) updateConfig({ maxIndex: n });
                  }}
                />
              </label>
              <label className="field">
                <span>Handicap allowance (%)</span>
                <input
                  type="number"
                  min={50}
                  max={100}
                  value={Math.round(tournament.config.allowance * 100)}
                  onChange={(e) => {
                    const n = num(e.target.value);
                    if (n !== null && n >= 50 && n <= 100) updateConfig({ allowance: n / 100 });
                  }}
                />
              </label>
              <label className="field">
                <span>Flag an index older than (days)</span>
                <input
                  type="number"
                  min={7}
                  max={365}
                  value={tournament.staleIndexDays}
                  onChange={(e) => {
                    const n = num(e.target.value);
                    if (n !== null && n > 0) update({ staleIndexDays: n });
                  }}
                />
              </label>
              <label className="field">
                <span>Flights are set by</span>
                <select
                  value={tournament.config.flightBasis}
                  onChange={(e) =>
                    updateConfig({ flightBasis: e.target.value as TournamentConfig["flightBasis"] })
                  }
                >
                  <option value="index">Handicap index (demo assumption)</option>
                  <option value="courseHandicap">Course handicap</option>
                </select>
              </label>
            </div>
            <p className="hint">
              The index on or before the cut-off is frozen onto each registration. A later import
              never moves a frozen registration; the desk offers a re-freeze instead. The app never
              calculates or claims an official WHS index.
            </p>
            <label className="check text-[14px]">
              <input
                type="checkbox"
                checked={tournament.scheduleNeedsConfirmation}
                onChange={(e) => update({ scheduleNeedsConfirmation: e.target.checked })}
              />
              <span>
                Dates and cut-off are sample values and still need organizer confirmation.
              </span>
            </label>
          </SectionCard>

          <SectionCard
            id="categories"
            icon={<Users />}
            title="Categories"
            subtitle="Age on the first day plus gender picks one category, and one tee."
          >
            <div className="grid gap-3">
              {tournament.categories.map((c) => (
                <div
                  key={c.id}
                  className="grid gap-2.5 rounded-[12px] border border-line p-3 sm:grid-cols-2 xl:grid-cols-5"
                >
                  <label className="field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={c.name}
                      onChange={(e) => setCategory(c.id, { name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Gender</span>
                    <select
                      value={c.gender}
                      onChange={(e) =>
                        setCategory(c.id, { gender: e.target.value as CategoryRule["gender"] })
                      }
                    >
                      <option value="M">Men</option>
                      <option value="F">Women</option>
                      <option value="any">Everyone</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>From age</span>
                    <input
                      type="number"
                      value={c.minAge}
                      onChange={(e) => {
                        const n = num(e.target.value);
                        if (n !== null) setCategory(c.id, { minAge: n });
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>To age (blank = no limit)</span>
                    <input
                      type="number"
                      value={c.maxAge ?? ""}
                      onChange={(e) => {
                        const n = num(e.target.value);
                        setCategory(c.id, { maxAge: n });
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Tee</span>
                    <select
                      value={c.teeId}
                      onChange={(e) => setCategory(c.id, { teeId: e.target.value })}
                    >
                      {tees.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  update({
                    categories: [
                      ...tournament.categories,
                      {
                        id: idOf("cat"),
                        name: "New category",
                        gender: "M",
                        minAge: 0,
                        maxAge: null,
                        teeId: tees[0]?.id ?? "white",
                      },
                    ],
                  })
                }
              >
                <Plus aria-hidden="true" /> Add a category
              </Button>
            </div>
            <p className="hint">
              Regular, Senior and Ladies tee mappings are still open; only Super Senior = Silver is
              confirmed. Overlapping categories leave players in review rather than guessing one.
            </p>
          </SectionCard>

          <SectionCard
            id="flights"
            icon={<Layers />}
            title="Flights"
            subtitle="Fixed handicap ranges per category. Ranges must not overlap."
          >
            <div className="grid gap-3">
              {tournament.categories.map((c) => {
                const own = tournament.flights.filter((f) => f.categoryId === c.id);
                return (
                  <div key={c.id} className="grid gap-2">
                    <h3 className="small-h">{c.name}</h3>
                    {own.map((f) => (
                      <div
                        key={f.id}
                        className="grid gap-2.5 rounded-[12px] border border-line p-3 sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_auto]"
                      >
                        <label className="field">
                          <span>Flight name</span>
                          <input
                            type="text"
                            value={f.name}
                            onChange={(e) => setFlight(f.id, { name: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>From</span>
                          <input
                            type="number"
                            step={0.1}
                            value={f.min}
                            onChange={(e) => {
                              const n = num(e.target.value);
                              if (n !== null) setFlight(f.id, { min: n });
                            }}
                          />
                        </label>
                        <label className="field">
                          <span>To</span>
                          <input
                            type="number"
                            step={0.1}
                            value={f.max}
                            onChange={(e) => {
                              const n = num(e.target.value);
                              if (n !== null) setFlight(f.id, { max: n });
                            }}
                          />
                        </label>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${f.name}`}
                          className="justify-self-end text-ink-muted hover:text-danger"
                          onClick={() =>
                            update({ flights: tournament.flights.filter((x) => x.id !== f.id) })
                          }
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-self-start"
                      onClick={() =>
                        update({
                          flights: [
                            ...tournament.flights,
                            {
                              id: idOf("flt"),
                              categoryId: c.id,
                              name: `${c.name} new flight`,
                              min: 0,
                              max: tournament.config.maxIndex,
                            },
                          ],
                        })
                      }
                    >
                      <ListPlus aria-hidden="true" /> Add a flight to {c.name}
                    </Button>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard id="start" icon={<Flag />} title="Start & groups">
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
              <label className="field">
                <span>Start format</span>
                <select
                  value={tournament.config.startFormat}
                  onChange={(e) => updateConfig({ startFormat: e.target.value as StartFormat })}
                >
                  <option value="shotgun">Shotgun (18 holes, 4 per hole, waves)</option>
                  <option value="two_tee">Two-tee start (holes 1 and 10, timed)</option>
                </select>
              </label>
              <label className="field">
                <span>First tee time</span>
                <input
                  type="time"
                  value={tournament.config.firstTeeTime}
                  onChange={(e) => e.target.value && updateConfig({ firstTeeTime: e.target.value })}
                />
              </label>
              {tournament.config.startFormat === "two_tee" ? (
                <label className="field">
                  <span>Minutes between groups (interval)</span>
                  <input
                    type="number"
                    min={5}
                    max={30}
                    value={tournament.config.intervalMinutes}
                    onChange={(e) => {
                      const n = num(e.target.value);
                      if (n !== null && n > 0) updateConfig({ intervalMinutes: n });
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
                    value={tournament.config.waveGapMinutes}
                    onChange={(e) => {
                      const n = num(e.target.value);
                      if (n !== null && n > 0) updateConfig({ waveGapMinutes: n });
                    }}
                  />
                </label>
              )}
              <label className="field">
                <span>Holes</span>
                <input
                  type="number"
                  min={9}
                  max={18}
                  value={tournament.config.holes}
                  onChange={(e) => {
                    const n = num(e.target.value);
                    if (n !== null && n > 0) updateConfig({ holes: n });
                  }}
                />
              </label>
              <label className="field">
                <span>Most players per group</span>
                <select
                  value={tournament.config.groupSize}
                  onChange={(e) => updateConfig({ groupSize: Number(e.target.value) })}
                >
                  {[2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Smallest group before a flag</span>
                <select
                  value={tournament.config.minGroupSize}
                  onChange={(e) => updateConfig({ minGroupSize: Number(e.target.value) })}
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Order inside a flight (open question)</span>
                <input type="text" value="By handicap, lowest first" readOnly />
              </label>
            </div>
            <p className="hint">
              Shotgun: 18 holes × 4 players = 72 in a wave; a flight is never split unless it is
              larger than a wave, and that is flagged. Two-tee: slot n starts at the first time plus
              floor(n ÷ 2) × the interval, alternating holes 1 and 10.
            </p>
          </SectionCard>

          <SectionCard
            id="fields"
            icon={<ClipboardList />}
            title="Registration fields"
            subtitle="Core fields are fixed; these are the extra questions for this event."
          >
            <EntryLinkCard />
            <div className="grid gap-3">
              {tournament.registration.fields.map((f) => (
                <div key={f.id} className="grid gap-2.5 rounded-[12px] border border-line p-3">
                  <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="field">
                      <span>Label</span>
                      <input
                        type="text"
                        value={f.label}
                        onChange={(e) => setField(f.id, { label: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Type</span>
                      <select
                        value={f.type}
                        onChange={(e) =>
                          setField(f.id, { type: e.target.value as RegistrationField["type"] })
                        }
                      >
                        <option value="text">Text</option>
                        <option value="select">Choose one</option>
                        <option value="number">Number</option>
                        <option value="checkbox">Yes / no</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Asked of</span>
                      <select
                        value={f.appliesTo}
                        onChange={(e) =>
                          setField(f.id, {
                            appliesTo: e.target.value as RegistrationField["appliesTo"],
                          })
                        }
                      >
                        <option value="both">Members and guests</option>
                        <option value="member">Members</option>
                        <option value="guest">Guests</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Required</span>
                      <select
                        value={f.required ? "yes" : "no"}
                        onChange={(e) => setField(f.id, { required: e.target.value === "yes" })}
                      >
                        <option value="no">Optional</option>
                        <option value="yes">Required</option>
                      </select>
                    </label>
                    {f.type === "select" && (
                      <label className="field sm:col-span-2 xl:col-span-4">
                        <span>Choices, separated by commas</span>
                        <input
                          type="text"
                          value={f.options.join(", ")}
                          onChange={(e) =>
                            setField(f.id, {
                              options: e.target.value
                                .split(",")
                                .map((o) => o.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </label>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="hint">{f.help ?? "No help text"}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-ink-muted hover:text-danger"
                      onClick={() =>
                        updateRegistration({
                          fields: tournament.registration.fields.filter((x) => x.id !== f.id),
                        })
                      }
                    >
                      <Trash2 aria-hidden="true" /> Remove
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                className="justify-self-start"
                onClick={() =>
                  updateRegistration({
                    fields: [
                      ...tournament.registration.fields,
                      {
                        id: idOf("field"),
                        label: "New question",
                        type: "text",
                        options: [],
                        required: false,
                        appliesTo: "both",
                        help: null,
                        sample: false,
                      },
                    ],
                  })
                }
              >
                <Plus aria-hidden="true" /> Add a question
              </Button>
            </div>

            <div className="grid gap-3.5 border-t border-line pt-4 sm:grid-cols-2">
              <label className="field">
                <span>Sponsor question wording</span>
                <input
                  type="text"
                  value={tournament.registration.sponsorQuestion}
                  onChange={(e) => updateRegistration({ sponsorQuestion: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Response email</span>
                <input
                  type="email"
                  value={tournament.registration.responseEmail}
                  onChange={(e) => updateRegistration({ responseEmail: e.target.value })}
                />
              </label>
              <label className="field sm:col-span-2">
                <span>Desk instructions</span>
                <textarea
                  rows={2}
                  value={tournament.registration.instructions ?? ""}
                  onChange={(e) => updateRegistration({ instructions: e.target.value })}
                />
              </label>
            </div>
            <div className="notice" role="note">
              <p className="text-[13px]">
                <b>Shirt sizes:</b> {tournament.registration.shirtSizes.join(", ")} (fixed list for
                members and guests separately).
              </p>
              {tournament.registration.payment ? (
                <p className="mt-1 text-[13px]">
                  <b>Payment:</b> {tournament.registration.payment.method} ·{" "}
                  {tournament.registration.payment.bank} ·{" "}
                  {tournament.registration.payment.accountName} ·{" "}
                  {tournament.registration.payment.accountNumber}.{" "}
                  {tournament.registration.payment.note}
                </p>
              ) : (
                <p className="mt-1 text-[13px]">No payment instruction on this event.</p>
              )}
            </div>
          </SectionCard>
        </div>

        <aside className="panel-wrap grid gap-4" aria-label="Readiness">
          <section className="card grid gap-3">
            <h2 className="text-[17px]">Review &amp; readiness</h2>
            <p className="hint">
              Checked live against the current settings. A "must fix" item blocks a correct draw.
            </p>
            <ul className="plain grid gap-2.5">
              {checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2.5 text-[13px] leading-[18px]">
                  {c.level === "ok" ? (
                    <CheckCircle2
                      className="mt-px size-4 shrink-0 text-success"
                      aria-hidden="true"
                    />
                  ) : c.level === "warn" ? (
                    <TriangleAlert
                      className="mt-px size-4 shrink-0 text-warning"
                      aria-hidden="true"
                    />
                  ) : (
                    <CircleAlert className="mt-px size-4 shrink-0 text-danger" aria-hidden="true" />
                  )}
                  <span className="min-w-0">
                    <b className="block font-semibold">{c.label}</b>
                    {c.detail && <span className="block text-ink-muted">{c.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card grid gap-2">
            <h3 className="flex items-center gap-2 text-[15px]">
              <Save className="size-4 text-fairway" aria-hidden="true" /> Where changes live
            </h3>
            <p className="hint">
              This is a demo shell: settings live in this browser session and are gone on refresh.
              No Supabase project is connected, so nothing is written anywhere.
            </p>
            <p className="hint">
              <Link href="/draw">Open the draw</Link> to see a setting take effect on the proposal.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
