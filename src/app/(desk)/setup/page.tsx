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
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CourseCardEditor } from "@/components/course/CourseCardEditor";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { EntryLinkCard } from "@/components/public/EntryLinkCard";
import { Button } from "@/components/ui/button";
import { ResizableTextarea } from "@/components/ui/resizable-textarea";
import { checkTournament } from "@/lib/data/config-checks";
import {
  blankHoles,
  courseDataStatus,
  holesComplete,
  parProblem,
  strokeIndexProblem,
} from "@/lib/data/course-data";
import { nextPlayDay } from "@/lib/data/dates";
import { SETUP_SECTIONS, type SetupSection } from "@/lib/data/setup-payload";
import type { Hole, RegistrationField, Tournament, TournamentRegistration } from "@/lib/data/types";
import type { CategoryRule, FlightRule, StartFormat, Tee, TournamentConfig } from "@/lib/routing";
import { useDesk } from "@/lib/store/desk-store";
import { cn } from "@/lib/ui/cn";

const SECTIONS = [
  ["basics", "Basics"],
  ["playbook", "Rules of play"],
  ["course", "Course & tees"],
  ["rules", "Cut-off & handicap"],
  ["categories", "Categories"],
  ["flights", "Flights"],
  ["start", "Start & groups"],
  ["fields", "Registration fields"],
] as const;

type SetupTab = (typeof SECTIONS)[number][0];

/** A link may name a section the tabs spell differently. */
const TAB_ALIAS: Record<string, SetupTab> = { registration: "fields" };

/** The tab named in the URL hash, or Basics when there is none or it is unknown. */
function readTab(): SetupTab {
  if (typeof window === "undefined") return "basics";
  const raw = window.location.hash.replace("#", "");
  const id = TAB_ALIAS[raw] ?? raw;
  return SECTIONS.some(([section]) => section === id) ? (id as SetupTab) : "basics";
}

const SECTION_TITLE: Record<SetupSection, string> = {
  basics: "Basics",
  playbook: "Rules of play",
  rules: "Cut-off & handicap",
  start: "Start & groups",
  fields: "Registration fields",
  course: "Course & tees",
  categories: "Categories",
  flights: "Flights",
};

export default function SetupPage() {
  const { tournament, tees, holes, adapters, status, member, state } = useDesk();
  if (!tournament) return <NeedsTournament what="Settings" />;
  // Owner and organizer only, the same rule the database enforces. Demo mode has no roles.
  const canEdit = status === "demo" || member?.role === "owner" || member?.role === "organizer";
  return (
    <SetupWizard
      tournament={tournament}
      tees={tees}
      holes={holes}
      status={status}
      canEdit={canEdit}
      hasDraw={Boolean(state.boards[tournament.id]?.draw)}
      save={async (input) => adapters.setup.save(input)}
      confirmCourse={(confirmed) => adapters.setup.confirmCourse(tournament.id, confirmed)}
      saveDayRule={(required, max) =>
        adapters.tournaments.saveDayRule(tournament.id, required, max)
      }
    />
  );
}

function SetupWizard({
  tournament,
  tees,
  holes,
  status,
  canEdit,
  hasDraw,
  save,
  confirmCourse,
  saveDayRule,
}: {
  tournament: Tournament;
  tees: ReturnType<typeof useDesk>["tees"];
  holes: ReturnType<typeof useDesk>["holes"];
  status: ReturnType<typeof useDesk>["status"];
  canEdit: boolean;
  /** An existing board was routed against the numbers this screen edits. */
  hasDraw: boolean;
  save: (input: {
    tournament: Tournament;
    tees: ReturnType<typeof useDesk>["tees"];
    holes: ReturnType<typeof useDesk>["holes"];
    sections: SetupSection[] | "all";
  }) => Promise<void>;
  confirmCourse: (confirmed: boolean) => void;
  saveDayRule: (required: number | null, max: number | null) => Promise<void>;
}) {
  // Everything on this screen is a draft until a save button is pressed. The old screen wrote on
  // every keystroke; the bulk write could not be retried as a whole, and a single failure left a
  // half-known state. A section save is the fallback when the whole-setup write fails.
  const [draft, setDraft] = useState(tournament);
  const [draftTees, setDraftTees] = useState(tees);
  // An event with no card on file still has to be typeable, so the editor opens on 18 blank rows.
  const [draftHoles, setDraftHoles] = useState(() =>
    holes.length > 0 ? holes : blankHoles(tournament.courseId),
  );
  const [dirty, setDirty] = useState<SetupSection[]>([]);
  const [dayRuleRequired, setDayRuleRequired] = useState<number | null>(
    tournament.requiredDays ?? null,
  );
  const [dayRuleMax, setDayRuleMax] = useState<number | null>(tournament.maxDays ?? null);
  const [dayRuleSaving, setDayRuleSaving] = useState(false);
  const [dayRuleMessage, setDayRuleMessage] = useState("");
  const [dayRuleError, setDayRuleError] = useState("");
  // Re-seed when the desk loads or a save lands. A save dispatches what was just sent, so this
  // mirrors the draft back rather than replacing unsaved work.
  useEffect(() => setDraft(tournament), [tournament]);
  useEffect(() => setDraftTees(tees), [tees]);
  useEffect(() => {
    // Only when the store actually has a card. Re-seeding blanks whenever the effect runs would wipe
    // a half-typed one.
    if (holes.length > 0) setDraftHoles(holes);
  }, [holes]);

  // One section per view, with the tab kept in the URL hash. A link like /setup#course opens on
  // Course & tees, the back button walks the tabs, and no section is a scroll away.
  const [tab, setTab] = useState<SetupTab>(() => "basics");
  useEffect(() => {
    const sync = () => setTab(readTab());
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  const selectTab = (id: SetupTab) => {
    setTab(id);
    if (window.location.hash !== `#${id}`) window.history.pushState(null, "", `#${id}`);
    document.getElementById("setup-tabs")?.scrollIntoView({ block: "start" });
  };

  const mark = (...sections: SetupSection[]) =>
    setDirty((current) => [...new Set([...current, ...sections])]);
  const clear = (sections: SetupSection[]) =>
    setDirty((current) => current.filter((section) => !sections.includes(section)));

  const update = (patch: Partial<Tournament>, section: SetupSection) => {
    setDraft((current) => ({ ...current, ...patch }));
    mark(section);
  };
  const updateConfig = (patch: Partial<TournamentConfig>, section: SetupSection) => {
    setDraft((current) => ({ ...current, config: { ...current.config, ...patch } }));
    mark(section);
  };
  const updateRegistration = (patch: Partial<TournamentRegistration>) => {
    setDraft((current) => ({
      ...current,
      registration: { ...current.registration, ...patch },
    }));
    mark("fields");
  };

  // Ratings and stroke index only: a tee's name is what a category points at, and a hole's number is
  // its identity, so neither is editable here.
  const updateTee = (id: string, patch: Partial<Tee>) => {
    setDraftTees((current) => current.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    mark("course");
  };
  const replaceHoles = (next: Hole[]) => {
    setDraftHoles(next);
    mark("course");
  };

  const setDay = (index: number, value: string) => {
    if (!value) return;
    setDraft((current) => {
      const dates = current.dates.map((date, i) => (i === index ? value : date));
      return index === 0
        ? { ...current, dates, config: { ...current.config, date: value } }
        : { ...current, dates };
    });
    mark("basics");
  };
  const addDay = () => {
    setDraft((current) => ({
      ...current,
      dates: [...current.dates, nextPlayDay(current.dates, current.config.date)],
    }));
    mark("basics");
  };
  const removeDay = (index: number) => {
    setDraft((current) => {
      if (current.dates.length <= 1) return current;
      const dates = current.dates.filter((_, i) => i !== index);
      return index === 0
        ? {
            ...current,
            dates,
            config: { ...current.config, date: dates[0] ?? current.config.date },
          }
        : { ...current, dates };
    });
    mark("basics");
  };

  const checks = checkTournament(draft, draftTees, draftHoles);
  const bad = checks.filter((c) => c.level === "bad").length;
  const warn = checks.filter((c) => c.level === "warn").length;

  // Where the course numbers on a sheet come from, derived rather than typed in. A blank hole or a
  // repeated stroke index means the card cannot be called official even if it was confirmed once.
  const cardProblem = strokeIndexProblem(draftHoles) ?? parProblem(draftHoles);
  const cardComplete = holesComplete(draftHoles) && cardProblem === null;
  const courseStatus = courseDataStatus({
    confirmed: draft.courseDataConfirmed,
    tees: draftTees,
    holes: draftHoles,
  });

  const num = (v: string) => (v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  const setCategory = (id: string, patch: Partial<CategoryRule>) => {
    setDraft((current) => ({
      ...current,
      categories: current.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
    mark("categories");
  };
  const setFlight = (id: string, patch: Partial<FlightRule>) => {
    setDraft((current) => ({
      ...current,
      flights: current.flights.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
    mark("flights");
  };
  const setField = (id: string, patch: Partial<RegistrationField>) => {
    setDraft((current) => ({
      ...current,
      registration: {
        ...current.registration,
        fields: current.registration.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      },
    }));
    mark("fields");
  };

  const idOf = (prefix: string) => `${prefix}-${Date.now().toString(36)}`;

  // A save is reported only when the database has answered. `savingSections` holds the sections in
  // flight, `saveError` keeps the failure on screen instead of letting the bar say "no unsaved
  // changes", and the dirty flag is cleared only after the write resolves.
  const [savingSections, setSavingSections] = useState<SetupSection[] | null>(null);
  const [saveError, setSaveError] = useState("");
  const [retrySections, setRetrySections] = useState<SetupSection[] | "all" | null>(null);
  const [drawStale, setDrawStale] = useState(false);

  // Sections that can change what the draw routes on. Saving any of them bumps the event's draw
  // revision in the database, which makes an existing board out of date.
  const ROUTING_SECTIONS: SetupSection[] = [
    "basics",
    "rules",
    "start",
    "course",
    "categories",
    "flights",
  ];

  const saveSections = async (sections: SetupSection[] | "all") => {
    if (!canEdit) return;
    const list = sections === "all" ? SETUP_SECTIONS : sections;
    setSavingSections(list);
    setSaveError("");
    try {
      await save({ tournament: draft, tees: draftTees, holes: draftHoles, sections });
      clear(list);
      setRetrySections(null);
      if (hasDraw && list.some((section) => ROUTING_SECTIONS.includes(section))) {
        setDrawStale(true);
      }
    } catch (e) {
      // The draft stays exactly as it is: the write was refused, not the edit.
      setSaveError(e instanceof Error ? e.message : "The setup could not be saved.");
      setRetrySections(sections);
    } finally {
      setSavingSections(null);
    }
  };
  const saving = savingSections !== null;
  const discard = () => {
    setDraft(tournament);
    setDraftTees(tees);
    setDraftHoles(holes.length > 0 ? holes : blankHoles(tournament.courseId));
    setDirty([]);
    setSaveError("");
    setRetrySections(null);
  };

  const sectionAction = (section: SetupSection) => (
    <Button
      variant="secondary"
      size="sm"
      disabled={!canEdit || saving || !dirty.includes(section)}
      onClick={() => void saveSections([section])}
      aria-label={`Save ${SECTION_TITLE[section]}`}
    >
      <Save aria-hidden="true" /> Save
    </Button>
  );

  const dirtyCount = dirty.length;
  const saveState = !canEdit
    ? "Only the owner or an organizer can change the event setup."
    : saving
      ? "Saving…"
      : dirtyCount === 0
        ? "No unsaved changes."
        : `${dirtyCount} section${dirtyCount === 1 ? "" : "s"} with unsaved changes.`;

  return (
    <div className="grid gap-6">
      <PageHeader
        overline="Settings & configuration"
        title="Tournament setup"
        crumbs={[{ label: draft.name, href: "/tournaments" }, { label: "Settings" }]}
        actions={
          <span className={cn("pill", bad > 0 ? "bad" : warn > 0 ? "warn" : "ok")}>
            {bad > 0 ? `${bad} must fix` : warn > 0 ? `${warn} to check` : "Ready to publish"}
          </span>
        }
      >
        {status === "demo"
          ? "Demo shell: changes apply to this browser session and are gone on refresh."
          : "Every rule here is a setting for this event, not a fixed law. Save one section or save everything; the session bar shows whether the write landed."}
      </PageHeader>

      <div
        id="setup-tabs"
        role="tablist"
        aria-label="Setup sections"
        className="flex scroll-mt-24 flex-wrap gap-2"
      >
        {SECTIONS.map(([id, label]) => {
          const active = tab === id;
          const unsaved = dirty.includes(id);
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={active ? id : undefined}
              onClick={() => selectTab(id)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium",
                active
                  ? "border-gold bg-gold text-on-gold"
                  : "border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken",
              )}
            >
              {label}
              {unsaved && (
                <span
                  className="size-1.5 rounded-full bg-danger"
                  title="Unsaved changes"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="no-print sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-surface-raised px-4 py-3 shadow-card">
        <p className="hint m-0" role="status">
          {saveState}
        </p>
        <span className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!canEdit || dirtyCount === 0}
            onClick={discard}
          >
            <RotateCcw aria-hidden="true" /> Discard changes
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canEdit || saving || dirtyCount === 0}
            onClick={() => void saveSections("all")}
          >
            <Save aria-hidden="true" /> {saving ? "Saving…" : "Save all changes"}
          </Button>
        </span>
      </div>

      {saveError && (
        <div className="notice bad flex flex-wrap items-start gap-2.5" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="m-0 text-[13px]">
            <b>The setup was not saved.</b> {saveError} The draft is still here, so the save can be
            tried again.
          </p>
          {retrySections && (
            <Button
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => void saveSections(retrySections)}
              className="ml-auto"
            >
              <Save aria-hidden="true" /> Retry save
            </Button>
          )}
        </div>
      )}

      {drawStale && (
        <div className="notice warn flex items-start gap-2.5" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-[13px]">
            <b>The draw is out of date.</b> This save changed settings the draw was routed against,
            so the board that is on file no longer matches the setup. Run the draw again before
            printing or publishing.
          </p>
        </div>
      )}

      {!canEdit && (
        <div className="notice warn flex items-start gap-2.5" role="note">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-[13px]">
            Only the owner or an organizer can change the event setup. The desk can read this
            screen; the save buttons are off and the database refuses the write anyway.
          </p>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <fieldset disabled={!canEdit} className="contents">
          <legend className="sr">Tournament setup fields</legend>
          <div className="grid min-w-0 gap-6">
            {tab === "basics" && (
              <SectionCard
                id="basics"
                icon={<SlidersHorizontal />}
                title="Basics"
                action={sectionAction("basics")}
              >
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <label className="field sm:col-span-2">
                    <span>Event name</span>
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(e) => update({ name: e.target.value }, "basics")}
                    />
                  </label>
                  <label className="field">
                    <span>Registered state</span>
                    <select
                      value={draft.state}
                      onChange={(e) =>
                        update({ state: e.target.value as Tournament["state"] }, "basics")
                      }
                    >
                      <option value="draft">Draft</option>
                      <option value="open">Open</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                </div>
                <div className="grid gap-2.5">
                  <span className="text-[13px] font-semibold">Days of play</span>
                  {draft.dates.map((date, index) => (
                    <div key={index} className="flex flex-wrap items-end gap-2">
                      <label className="field min-w-0 flex-1">
                        <span>
                          {index === 0 ? "Day 1 (first day of play)" : `Day ${index + 1}`}
                        </span>
                        <input
                          type="date"
                          value={date}
                          onChange={(e) => setDay(index, e.target.value)}
                        />
                      </label>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove day ${index + 1}`}
                        disabled={draft.dates.length <= 1}
                        className="text-ink-muted hover:text-danger"
                        onClick={() => removeDay(index)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={addDay}>
                      <Plus aria-hidden="true" /> Add a day
                    </Button>
                  </div>
                  <p className="hint">
                    Add a day puts the next calendar day after the last one, and every day keeps its
                    own date field, so a specific date can be set. Age and cut-off are read on the
                    first day until the club says which day counts. This is an open question.
                  </p>
                  <div className="grid gap-2 rounded-[12px] border border-line bg-surface-sunken p-3">
                    <b className="text-[14px]">Playing-day rule</b>
                    <p className="hint">
                      A four-day event can require two days, for example. The rule is checked when a
                      registration is saved or imported. Leave both empty for no rule.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="field">
                        <span>Must play exactly (days)</span>
                        <input
                          type="number"
                          min={1}
                          max={draft.dates.length}
                          value={dayRuleRequired ?? ""}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setDayRuleRequired(e.target.value ? Number(e.target.value) : null)
                          }
                        />
                      </label>
                      <label className="field">
                        <span>May play at most (days)</span>
                        <input
                          type="number"
                          min={1}
                          max={draft.dates.length}
                          value={dayRuleMax ?? ""}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setDayRuleMax(e.target.value ? Number(e.target.value) : null)
                          }
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!canEdit || dayRuleSaving}
                        onClick={async () => {
                          setDayRuleSaving(true);
                          setDayRuleError("");
                          setDayRuleMessage("");
                          try {
                            await saveDayRule(dayRuleRequired, dayRuleMax);
                            setDayRuleMessage("Playing-day rule saved.");
                          } catch (e) {
                            setDayRuleError(
                              e instanceof Error ? e.message : "The day rule could not be saved.",
                            );
                          } finally {
                            setDayRuleSaving(false);
                          }
                        }}
                      >
                        {dayRuleSaving ? "Saving…" : "Save rule"}
                      </Button>
                      {dayRuleMessage && <span className="hint">{dayRuleMessage}</span>}
                      {dayRuleError && (
                        <span className="hint !text-danger" role="alert">
                          {dayRuleError}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <label className="check text-[14px]">
                  <input
                    type="checkbox"
                    checked={draft.nameNeedsConfirmation}
                    onChange={(e) => update({ nameNeedsConfirmation: e.target.checked }, "basics")}
                  />
                  <span>
                    The event name still needs the organizer's confirmation. It is shown with a
                    caution note until this is unticked.
                  </span>
                </label>
              </SectionCard>
            )}

            {tab === "playbook" && (
              <SectionCard
                id="playbook"
                icon={<ClipboardList />}
                title="Rules of play"
                subtitle="The organizers' rules, shown on the public page while this event is published."
                action={sectionAction("playbook")}
              >
                <label className="field">
                  <span>Rules of play</span>
                  <ResizableTextarea
                    id="rules-of-play"
                    resizeLabel="Rules of play"
                    rows={8}
                    disabled={!canEdit}
                    value={draft.rulesOfPlay ?? ""}
                    onChange={(e) => update({ rulesOfPlay: e.target.value }, "playbook")}
                  />
                </label>
                <p className="hint">
                  One rule per line works best; blank lines separate paragraphs. The text is shown
                  to players exactly as written, without contact details or photos. Leave it empty
                  until the organizers provide their rules, and the section stays off the public
                  page.
                </p>
              </SectionCard>
            )}

            {tab === "course" && (
              <SectionCard
                id="course"
                icon={<Flag />}
                dataHelp="setup-course"
                title="Course & tees"
                subtitle={
                  courseStatus === "official"
                    ? "Confirmed against the club scorecard."
                    : "Not confirmed yet. Sheets carry a placeholder mark until it is."
                }
                action={sectionAction("course")}
              >
                <div
                  className={cn(
                    "notice flex items-start gap-2.5",
                    courseStatus === "official" ? "ok" : "warn",
                  )}
                  role="note"
                >
                  {courseStatus === "official" ? (
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-success"
                      aria-hidden="true"
                    />
                  ) : (
                    <TriangleAlert
                      className="mt-0.5 size-4 shrink-0 text-warning"
                      aria-hidden="true"
                    />
                  )}
                  <p className="text-[13px]">
                    {courseStatus === "official" ? (
                      <>
                        <b>These numbers were confirmed.</b> Changing any rating, par or stroke
                        index withdraws the confirmation, because what is on screen is then no
                        longer what was checked against the card.
                      </>
                    ) : (
                      <>
                        <b>Enter the club&rsquo;s real numbers from its scorecard.</b> Course
                        Rating, Slope, Par and stroke index come from the card, not from this app.
                        Until an owner or organizer confirms them below, treat what is on screen as
                        sample data.
                      </>
                    )}
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
                <CourseCardEditor
                  holes={draftHoles}
                  tees={draftTees}
                  onChange={replaceHoles}
                  onTeeParChange={(id, par) => updateTee(id, { par })}
                  disabled={!canEdit}
                  idPrefix="setup"
                />

                {/* The one thing that cannot be derived: a person saying the numbers were checked. */}
                <div className="well grid gap-2 p-3.5">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={draft.courseDataConfirmed}
                      // Available only for a whole, valid card, and only to the roles the database
                      // lets write the column. The fieldset above already disables it for the desk.
                      disabled={!cardComplete || draftTees.length === 0}
                      onChange={(e) => {
                        setDraft((current) => ({
                          ...current,
                          courseDataConfirmed: e.target.checked,
                        }));
                        confirmCourse(e.target.checked);
                      }}
                    />
                    <span>
                      <b>These tees and holes match the club scorecard.</b>
                      <span className="hint block">
                        {cardComplete
                          ? "Tick this once every rating, par and stroke index has been checked against the printed card. Sheets then print without the placeholder mark, and any later edit to a number withdraws it again."
                          : "Available once all 18 holes have a par and a stroke index, and no stroke index is used twice."}
                      </span>
                    </span>
                  </label>
                </div>
              </SectionCard>
            )}

            {tab === "rules" && (
              <SectionCard
                id="rules"
                icon={<CalendarClock />}
                dataHelp="setup-rules"
                title="Cut-off & handicap"
                action={sectionAction("rules")}
              >
                <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="field">
                    <span>Index cut-off date</span>
                    <input
                      type="date"
                      value={draft.cutOffDate}
                      onChange={(e) =>
                        e.target.value && update({ cutOffDate: e.target.value }, "rules")
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Highest index allowed</span>
                    <input
                      type="number"
                      min={0}
                      max={54}
                      step={0.1}
                      value={draft.config.maxIndex}
                      onChange={(e) => {
                        const n = num(e.target.value);
                        if (n !== null) updateConfig({ maxIndex: n }, "rules");
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Handicap allowance (%)</span>
                    <input
                      type="number"
                      min={50}
                      max={100}
                      value={Math.round(draft.config.allowance * 100)}
                      onChange={(e) => {
                        const n = num(e.target.value);
                        if (n !== null && n >= 50 && n <= 100)
                          updateConfig({ allowance: n / 100 }, "rules");
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Flag an index older than (days)</span>
                    <input
                      type="number"
                      min={7}
                      max={365}
                      value={draft.staleIndexDays}
                      onChange={(e) => {
                        const n = num(e.target.value);
                        if (n !== null && n > 0) update({ staleIndexDays: n }, "rules");
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Flights are set by</span>
                    <select
                      value={draft.config.flightBasis}
                      onChange={(e) =>
                        updateConfig(
                          { flightBasis: e.target.value as TournamentConfig["flightBasis"] },
                          "rules",
                        )
                      }
                    >
                      <option value="index">Handicap index (demo assumption)</option>
                      <option value="courseHandicap">Course handicap</option>
                    </select>
                  </label>
                </div>
                <p className="hint">
                  The index on or before the cut-off is frozen onto each registration. A later
                  import never moves a frozen registration; the desk offers a re-freeze instead. The
                  app never calculates or claims an official WHS index.
                </p>
                <label className="check text-[14px]">
                  <input
                    type="checkbox"
                    checked={draft.scheduleNeedsConfirmation}
                    onChange={(e) =>
                      update({ scheduleNeedsConfirmation: e.target.checked }, "rules")
                    }
                  />
                  <span>
                    Dates and cut-off are sample values and still need organizer confirmation.
                  </span>
                </label>
              </SectionCard>
            )}

            {tab === "categories" && (
              <SectionCard
                id="categories"
                icon={<Users />}
                title="Categories"
                subtitle="Age on the first day plus gender picks one category, and one tee."
                action={sectionAction("categories")}
              >
                <div className="grid gap-3">
                  {draft.categories.map((c) => (
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
                      update(
                        {
                          categories: [
                            ...draft.categories,
                            {
                              id: idOf("cat"),
                              name: "New category",
                              gender: "M",
                              minAge: 0,
                              maxAge: null,
                              teeId: tees[0]?.id ?? "white",
                            },
                          ],
                        },
                        "categories",
                      )
                    }
                  >
                    <Plus aria-hidden="true" /> Add a category
                  </Button>
                </div>
                <p className="hint">
                  Regular, Senior and Ladies tee mappings are still open; only Super Senior = Silver
                  is confirmed. Overlapping categories leave players in review rather than guessing
                  one.
                </p>
              </SectionCard>
            )}

            {tab === "flights" && (
              <SectionCard
                id="flights"
                icon={<Layers />}
                dataHelp="setup-flights"
                title="Flights"
                subtitle="Fixed handicap ranges per category. Ranges must not overlap."
                action={sectionAction("flights")}
              >
                <div className="grid gap-3">
                  {draft.categories.map((c) => {
                    const own = draft.flights.filter((f) => f.categoryId === c.id);
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
                                update(
                                  { flights: draft.flights.filter((x) => x.id !== f.id) },
                                  "flights",
                                )
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
                            update(
                              {
                                flights: [
                                  ...draft.flights,
                                  {
                                    id: idOf("flt"),
                                    categoryId: c.id,
                                    name: `${c.name} new flight`,
                                    min: 0,
                                    max: draft.config.maxIndex,
                                  },
                                ],
                              },
                              "flights",
                            )
                          }
                        >
                          <ListPlus aria-hidden="true" /> Add a flight to {c.name}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            {tab === "start" && (
              <SectionCard
                id="start"
                icon={<Flag />}
                title="Start & groups"
                action={sectionAction("start")}
              >
                <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                  <label className="field">
                    <span>Start format</span>
                    <select
                      value={draft.config.startFormat}
                      onChange={(e) =>
                        updateConfig({ startFormat: e.target.value as StartFormat }, "start")
                      }
                    >
                      <option value="shotgun">Shotgun (18 holes, 4 per hole, waves)</option>
                      <option value="two_tee">Two-tee start (holes 1 and 10, timed)</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>First tee time</span>
                    <input
                      type="time"
                      value={draft.config.firstTeeTime}
                      onChange={(e) =>
                        e.target.value && updateConfig({ firstTeeTime: e.target.value }, "start")
                      }
                    />
                  </label>
                  {draft.config.startFormat === "two_tee" ? (
                    <label className="field">
                      <span>Minutes between groups (interval)</span>
                      <input
                        type="number"
                        min={5}
                        max={30}
                        value={draft.config.intervalMinutes}
                        onChange={(e) => {
                          const n = num(e.target.value);
                          if (n !== null && n > 0) updateConfig({ intervalMinutes: n }, "start");
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
                        value={draft.config.waveGapMinutes}
                        onChange={(e) => {
                          const n = num(e.target.value);
                          if (n !== null && n > 0) updateConfig({ waveGapMinutes: n }, "start");
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
                      value={draft.config.holes}
                      onChange={(e) => {
                        const n = num(e.target.value);
                        if (n !== null && n > 0) updateConfig({ holes: n }, "start");
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Most players per group</span>
                    <select
                      value={draft.config.groupSize}
                      onChange={(e) => updateConfig({ groupSize: Number(e.target.value) }, "start")}
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
                      value={draft.config.minGroupSize}
                      onChange={(e) =>
                        updateConfig({ minGroupSize: Number(e.target.value) }, "start")
                      }
                    >
                      {[1, 2, 3].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Order inside a flight (organizer decision)</span>
                    <input type="text" value="By handicap, lowest first" readOnly />
                  </label>
                </div>
                <p className="hint">
                  Shotgun: 18 holes × 4 players = 72 in a wave; a flight is never split unless it is
                  larger than a wave, and that is flagged. Two-tee: slot n starts at the first time
                  plus floor(n ÷ 2) × the interval, alternating holes 1 and 10.
                </p>
              </SectionCard>
            )}

            {tab === "fields" && (
              <SectionCard
                id="fields"
                icon={<ClipboardList />}
                title="Registration fields"
                subtitle="Core fields are fixed; these are the extra questions for this event."
                action={sectionAction("fields")}
              >
                <EntryLinkCard />
                <div className="grid gap-3">
                  {draft.registration.fields.map((f) => (
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
                              fields: draft.registration.fields.filter((x) => x.id !== f.id),
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
                          ...draft.registration.fields,
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
                      value={draft.registration.sponsorQuestion}
                      onChange={(e) => updateRegistration({ sponsorQuestion: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Response email</span>
                    <input
                      type="email"
                      value={draft.registration.responseEmail}
                      onChange={(e) => updateRegistration({ responseEmail: e.target.value })}
                    />
                  </label>
                  <div className="field sm:col-span-2">
                    <label htmlFor="desk-instructions">Desk instructions</label>
                    <ResizableTextarea
                      id="desk-instructions"
                      resizeLabel="Desk instructions"
                      rows={2}
                      disabled={!canEdit}
                      value={draft.registration.instructions ?? ""}
                      onChange={(e) => updateRegistration({ instructions: e.target.value })}
                    />
                  </div>
                </div>
                <div className="notice" role="note">
                  <p className="text-[13px]">
                    <b>Shirt sizes:</b> {draft.registration.shirtSizes.join(", ")} (fixed list for
                    members and guests separately).
                  </p>
                  {draft.registration.payment ? (
                    <p className="mt-1 text-[13px]">
                      <b>Payment:</b> {draft.registration.payment.method} ·{" "}
                      {draft.registration.payment.bank} · {draft.registration.payment.accountName} ·{" "}
                      {draft.registration.payment.accountNumber}. {draft.registration.payment.note}
                    </p>
                  ) : (
                    <p className="mt-1 text-[13px]">No payment instruction on this event.</p>
                  )}
                </div>
              </SectionCard>
            )}
          </div>
        </fieldset>

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
              {status === "demo"
                ? "This is a demo shell: settings live in this browser session and are gone on refresh. No Supabase project is connected, so nothing is written anywhere."
                : canEdit
                  ? "Every save writes to the club database through one guarded transaction. Save a section on its own, or use Save all; a failed write is shown above and the change stays on screen until you retry."
                  : "Only the owner or an organizer can change the event setup. This screen is read-only for the desk."}
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
