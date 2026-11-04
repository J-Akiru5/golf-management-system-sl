"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageIcon,
  Mail,
  Pencil,
  Plus,
  Send,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  calendarEvent,
  eventsOnDate,
  findCalendarConflicts,
  monthCells,
  monthLabel,
  monthOf,
} from "@/lib/calendar/calendar";
import { buildIcs, googleCalendarUrl } from "@/lib/calendar/ics";
import type { EmailOutboxMessage } from "@/lib/data/email";
import { fmtRange } from "@/lib/data/labels";
import type { Tournament } from "@/lib/data/types";
import { shrinkLogo } from "@/lib/photo";
import { useDesk } from "@/lib/store/desk-store";
import { cn } from "@/lib/ui/cn";

interface EventDraft {
  id: string | null;
  name: string;
  hostName: string;
  startDate: string;
  endDate: string;
  /** The real selected dates. A gap is preserved unless the range fields are edited. */
  dates: string[];
  state: Tournament["state"];
}

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

function datesBetween(start: string, end: string): string[] {
  if (!start || !end || end < start) return start ? [start] : [];
  const values: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    values.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return values;
}

function emptyDraft(date = today()): EventDraft {
  return {
    id: null,
    name: "",
    hostName: "",
    startDate: date,
    endDate: date,
    dates: [date],
    state: "draft",
  };
}

function draftFrom(tournament: Tournament): EventDraft {
  const dates = [...tournament.dates].sort();
  return {
    id: tournament.id,
    name: tournament.name,
    hostName: tournament.hostName ?? "",
    startDate: dates[0] ?? today(),
    endDate: dates.at(-1) ?? dates[0] ?? today(),
    dates,
    state: tournament.state,
  };
}

const STATUS_LABEL: Record<Tournament["state"], string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

export default function CalendarPage() {
  const {
    tournaments,
    tournament: activeTournament,
    adapters,
    member,
    reload,
    state,
  } = useDesk();
  const [view, setView] = useState<"month" | "list">("month");
  const [cursor, setCursor] = useState(() => monthOf(today()));
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | undefined>();
  const [logoError, setLogoError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Set when a save moved the days of play while a board was already drawn. The board was routed
  // against the old dates, so it has to be run again before anyone prints it.
  const [drawWentStale, setDrawWentStale] = useState(false);
  const [emails, setEmails] = useState<EmailOutboxMessage[]>([]);
  const [emailBusy, setEmailBusy] = useState(false);
  const canManage = !member || member.role === "owner" || member.role === "organizer";
  const editing = draft?.id ? (tournaments.find((t) => t.id === draft.id) ?? null) : null;
  const calendarLink = editing
    ? googleCalendarUrl({
        id: editing.id,
        name: editing.name,
        hostName: editing.hostName,
        dates: editing.dates,
        description: "TeeLine Golf event",
      })
    : null;

  const events = useMemo(() => tournaments.map(calendarEvent), [tournaments]);
  const conflicts = useMemo(() => findCalendarConflicts(events), [events]);
  const cells = useMemo(() => monthCells(cursor.year, cursor.month), [cursor]);

  useEffect(() => {
    if (!editing) {
      setEmails([]);
      return;
    }
    let cancelled = false;
    void adapters.email
      .list(editing.id)
      .then((rows) => {
        if (!cancelled) setEmails(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load emails.");
      });
    return () => {
      cancelled = true;
    };
  }, [adapters.email, editing]);

  const openCreate = (date = today()) => {
    setDraft(emptyDraft(date));
    setLogoPreview(undefined);
    setLogoError("");
    setError("");
    setNotice("");
    setDrawWentStale(false);
  };

  const openEdit = (tournament: Tournament) => {
    setDraft(draftFrom(tournament));
    setLogoPreview(tournament.logoUrl);
    setLogoError("");
    setError("");
    setNotice("");
    setDrawWentStale(false);
  };

  const close = () => {
    if (busy) return;
    setDraft(null);
    setLogoPreview(undefined);
    setLogoError("");
    setError("");
    setNotice("");
  };

  const prospective = (): ReturnType<typeof calendarEvent> | null => {
    if (!draft) return null;
    const dates = draft.dates;
    if (!draft.name.trim() || dates.length === 0) return null;
    const existing = editing;
    return {
      id: draft.id ?? "new-event",
      name: draft.name.trim(),
      hostName: draft.hostName.trim() || null,
      courseId: existing?.courseId ?? activeTournament?.courseId ?? tournaments[0]?.courseId ?? "",
      status: draft.state,
      dates,
      days: dates.map((date, index) => ({
        playDate: date,
        startTime:
          index === 0
            ? (existing?.days?.[0]?.startTime ??
              existing?.config.firstTeeTime ??
              activeTournament?.config.firstTeeTime ??
              null)
            : null,
        label: `Day ${index + 1}`,
      })),
      logoUrl: logoPreview,
    };
  };

  const draftConflicts = useMemo(() => {
    const next = prospective();
    if (!next) return [];
    const others = events.filter((event) => event.id !== next.id);
    return findCalendarConflicts([...others, next]).filter(
      (conflict) => conflict.firstId === next.id || conflict.secondId === next.id,
    );
  }, [draft, editing, events, logoPreview]);

  const save = async () => {
    if (!draft || !canManage) return;
    const dates = draft.dates;
    if (!draft.name.trim()) return setError("Give the event a name.");
    if (!dates.length) return setError("Choose a start and end date.");
    const exact = draftConflicts.filter((conflict) => conflict.kind === "exact");
    if (exact.length) {
      setError(exact[0]?.detail ?? "That course and tee time are already booked.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    // An existing board was routed against the old days of play, and the write below is the one
    // that bumps the event's draw revision. Say so when that is the case.
    const datesChanged = editing ? editing.dates.join("|") !== dates.join("|") : false;
    const drawOutOfDate = Boolean(editing && datesChanged && state.boards[editing.id]?.draw);
    try {
      if (!editing) {
        const created = adapters.tournaments.createFromTemplate(
          draft.name.trim(),
          dates[0] as string,
          {
            hostName: draft.hostName.trim() || null,
            dates,
            logo: logoPreview?.startsWith("data:") ? logoPreview : undefined,
          },
        );
        const { saved: createWrite, ...eventRow } = created;
        // Wait for the course, the event row and its setup. Closing on the queued write would claim
        // an event that the database can still refuse.
        await createWrite;
        await adapters.tournaments.save({ ...eventRow, state: draft.state });
      } else {
        // The adapter writes the event-level fields through the guarded setup function, which also
        // bumps draw_revision. A direct tournaments write here used to change the dates and leave
        // the existing draw looking current.
        await adapters.tournaments.save({
          ...editing,
          name: draft.name.trim(),
          hostName: draft.hostName.trim() || null,
          dates,
          config: { ...editing.config, date: dates[0] as string },
          state: draft.state,
        });
        if (logoPreview?.startsWith("data:")) {
          await adapters.tournaments.setLogo(editing.id, logoPreview);
        } else if (!logoPreview && editing.logoUrl) {
          await adapters.tournaments.removeLogo(editing.id);
        }
      }
      setNotice(
        drawOutOfDate
          ? "Event saved. The draw is out of date; run it again before printing."
          : "Event saved. The calendar and printed cards use the new details.",
      );
      setDrawWentStale(drawOutOfDate);
      setCursor(monthOf(dates[0] as string));
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the event.");
      // The adapter already put its draft in the session. Re-read the database so a refused save
      // does not leave an event on the calendar that was never written.
      reload();
    } finally {
      setBusy(false);
    }
  };

  const chooseLogo = async (file: File | undefined) => {
    setLogoError("");
    if (!file) return setLogoPreview(undefined);
    try {
      setLogoPreview(await shrinkLogo(file));
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Could not read that image.");
    }
  };

  const downloadIcs = () => {
    const ics = buildIcs(
      events.map((event) => ({
        id: event.id,
        name: event.name,
        hostName: event.hostName,
        dates: event.dates,
        description: `${event.status === "open" ? "Open for registration" : STATUS_LABEL[event.status]}`,
      })),
    );
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "teeline-events.ics";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const queueEmails = async (kind: "confirmation" | "reminder") => {
    if (!editing) return;
    setEmailBusy(true);
    setNotice("");
    try {
      const result = await adapters.email.queue(editing.id, kind);
      setNotice(
        result.message ?? `${result.queued} ${kind} draft${result.queued === 1 ? "" : "s"} queued.`,
      );
      setEmails(await adapters.email.list(editing.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not queue emails.");
    } finally {
      setEmailBusy(false);
    }
  };

  const sendEmails = async () => {
    if (!editing) return;
    setEmailBusy(true);
    setNotice("");
    try {
      const result = await adapters.email.sendQueued(editing.id);
      setNotice(
        result.message ??
          (result.configured
            ? `${result.sent} sent, ${result.failed} failed.`
            : "Email provider is not configured. Drafts are still saved."),
      );
      setEmails(await adapters.email.list(editing.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send emails.");
    } finally {
      setEmailBusy(false);
    }
  };

  const retryEmails = async () => {
    if (!editing) return;
    setEmailBusy(true);
    setNotice("");
    try {
      const count = await adapters.email.retryFailed(editing.id);
      setNotice(`${count} failed email${count === 1 ? "" : "s"} moved back to queued.`);
      setEmails(await adapters.email.list(editing.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not requeue failed emails.");
    } finally {
      setEmailBusy(false);
    }
  };

  const exactConflicts = conflicts.filter((conflict) => conflict.kind === "exact");
  const sameDayConflicts = conflicts.filter((conflict) => conflict.kind === "same-day");

  return (
    <div className="grid gap-6">
      <PageHeader overline="Events" title="Calendar">
        Every event in one place. The same course and tee time cannot be booked twice; two events on
        the same day are allowed but shown as a warning.
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <div className="seg" role="tablist" aria-label="Calendar view">
          <button type="button" aria-pressed={view === "month"} onClick={() => setView("month")}>
            Month
          </button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
            List
          </button>
        </div>
        <Button variant="secondary" size="sm" onClick={downloadIcs}>
          <Download aria-hidden="true" /> Export .ics
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setCursor(monthOf(today()))}>
          Today
        </Button>
        {canManage && (
          <Button variant="primary" size="sm" className="ml-auto" onClick={() => openCreate()}>
            <Plus aria-hidden="true" /> New event
          </Button>
        )}
      </div>

      {exactConflicts.length > 0 && (
        <div className="notice bad" role="alert">
          <b>Double booking:</b> {exactConflicts.map((conflict) => conflict.detail).join(" ")}
        </div>
      )}
      {sameDayConflicts.length > 0 && (
        <div className="notice warn" role="status">
          <b>Same-day events:</b> {sameDayConflicts.map((conflict) => conflict.detail).join(" ")}
        </div>
      )}

      {drawWentStale && (
        <div className="notice warn flex items-start gap-2.5" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-[13px]">
            <b>The draw is out of date.</b> The days of play changed after the board was drawn, and
            the event&rsquo;s draw revision moved with this save. Run the draw again before printing
            or publishing.
          </p>
        </div>
      )}

      {view === "month" ? (
        <section className="card overflow-hidden p-0" aria-label="Event month">
          <div className="flex items-center justify-between gap-3 border-b border-line p-3">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous month"
              onClick={() =>
                setCursor((current) =>
                  current.month === 0
                    ? { year: current.year - 1, month: 11 }
                    : { year: current.year, month: current.month - 1 },
                )
              }
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <h2 className="m-0 text-[20px]">{monthLabel(cursor.year, cursor.month)}</h2>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next month"
              onClick={() =>
                setCursor((current) =>
                  current.month === 11
                    ? { year: current.year + 1, month: 0 }
                    : { year: current.year, month: current.month + 1 },
                )
              }
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <div className="grid grid-cols-7 border-b border-line bg-surface-sunken">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="px-2 py-2 text-center text-[10px] font-bold tracking-[.08em] text-ink-muted uppercase"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell) => {
              const dayEvents = eventsOnDate(events, cell.date);
              return (
                <div
                  key={cell.date}
                  className={cn(
                    "min-h-28 border-r border-b border-line p-1.5 last:border-r-0",
                    cell.inMonth ? "bg-surface" : "bg-surface-sunken/55 text-ink-muted",
                  )}
                >
                  <button
                    type="button"
                    className="mb-1 grid size-6 place-items-center rounded-full text-[11px] font-bold hover:bg-fairway-soft"
                    onClick={() => canManage && openCreate(cell.date)}
                    aria-label={`Create an event on ${cell.date}`}
                  >
                    {Number(cell.date.slice(-2))}
                  </button>
                  <div className="grid gap-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button
                        key={`${event.id}-${cell.date}`}
                        type="button"
                        className="flex min-w-0 items-center gap-1.5 rounded-md border border-line bg-surface-raised px-1.5 py-1 text-left text-[11px] hover:border-fairway"
                        onClick={() =>
                          canManage &&
                          openEdit(tournaments.find((t) => t.id === event.id) as Tournament)
                        }
                      >
                        {event.logoUrl ? (
                          <img
                            src={event.logoUrl}
                            alt=""
                            className="size-5 shrink-0 rounded object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <CalendarDays
                            className="size-3.5 shrink-0 text-fairway"
                            aria-hidden="true"
                          />
                        )}
                        <span className="min-w-0 truncate font-semibold">{event.name}</span>
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] text-ink-muted">
                        +{dayEvents.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[...events]
            .sort((a, b) => (a.dates[0] ?? "").localeCompare(b.dates[0] ?? ""))
            .map((event) => (
              <article key={event.id} className="card grid gap-3">
                <div className="flex items-start gap-3">
                  {event.logoUrl ? (
                    <img
                      src={event.logoUrl}
                      alt=""
                      className="size-12 rounded-lg object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="grid size-12 place-items-center rounded-lg bg-fairway-soft text-fairway">
                      <CalendarDays aria-hidden="true" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <h2 className="truncate text-[18px]">{event.name}</h2>
                    <p className="muted text-[13px]">{event.hostName ?? "No host recorded"}</p>
                  </div>
                </div>
                <p className="hint">
                  {fmtRange(event.dates)} · {STATUS_LABEL[event.status]}
                </p>
                <div className="flex gap-2">
                  {canManage && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        openEdit(tournaments.find((t) => t.id === event.id) as Tournament)
                      }
                    >
                      <Pencil aria-hidden="true" /> Edit
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/setup">Setup &amp; dates</Link>
                  </Button>
                </div>
              </article>
            ))}
        </div>
      )}

      {notice && <p className="hint !text-fairway">{notice}</p>}

      <Sheet open={draft !== null} onOpenChange={(open) => !open && close()}>
        <SheetContent
          title={editing ? "Edit event" : "New event"}
          description="The logo, host and title here are the same details used on the printed scorecard."
          className="w-[min(560px,calc(100vw-24px))] sm:p-5"
        >
          {draft && (
            <div className="grid gap-4">
              <label className="field">
                <span>Event title</span>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. 24th Bamboo Tee"
                  autoFocus
                />
              </label>
              <label className="field">
                <span>Host or sponsor</span>
                <input
                  value={draft.hostName}
                  onChange={(e) => setDraft({ ...draft, hostName: e.target.value })}
                  placeholder="e.g. Tesla"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="field">
                  <span>Start date</span>
                  <input
                    type="date"
                    value={draft.startDate}
                    onChange={(e) => {
                      const startDate = e.target.value;
                      const endDate = draft.endDate < startDate ? startDate : draft.endDate;
                      setDraft({
                        ...draft,
                        startDate,
                        endDate,
                        dates: datesBetween(startDate, endDate),
                      });
                    }}
                  />
                </label>
                <label className="field">
                  <span>End date</span>
                  <input
                    type="date"
                    min={draft.startDate}
                    value={draft.endDate}
                    onChange={(e) => {
                      const endDate = e.target.value;
                      setDraft({
                        ...draft,
                        endDate,
                        dates: datesBetween(draft.startDate, endDate),
                      });
                    }}
                  />
                </label>
              </div>
              <p className="hint">
                Playing days: {draft.dates.join(", ")}. Changing either date replaces the list with
                a continuous range.
              </p>
              <label className="field">
                <span>Status</span>
                <select
                  value={draft.state}
                  onChange={(e) =>
                    setDraft({ ...draft, state: e.target.value as Tournament["state"] })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="open">Open for registration</option>
                  <option value="closed">Closed</option>
                </select>
              </label>

              <div className="grid gap-2.5 rounded-[12px] border border-dashed border-line-strong p-3">
                <p className="overline">Event logo</p>
                <div className="flex items-center gap-3">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Event logo preview"
                      className="size-16 rounded-lg border border-line bg-white object-contain p-1"
                    />
                  ) : (
                    <span className="grid size-16 place-items-center rounded-lg border border-dashed border-line-strong bg-surface-sunken">
                      <ImageIcon className="size-5 text-ink-muted" aria-hidden="true" />
                    </span>
                  )}
                  <label className="field grow">
                    <span>{logoPreview ? "Replace logo" : "Upload logo"}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="text-[12px] text-ink-muted"
                      onChange={(e) => void chooseLogo(e.target.files?.[0])}
                    />
                  </label>
                  {logoPreview && (
                    <Button variant="ghost" size="sm" onClick={() => setLogoPreview(undefined)}>
                      Remove
                    </Button>
                  )}
                </div>
                <p className="hint">
                  PNG, JPEG or WebP. A transparent PNG is best for a sponsor mark.
                </p>
                {logoError && (
                  <p className="hint !text-danger" role="alert">
                    {logoError}
                  </p>
                )}
              </div>

              {draftConflicts.length > 0 && (
                <div
                  className={cn(
                    "notice",
                    draftConflicts.some((conflict) => conflict.kind === "exact") ? "bad" : "warn",
                  )}
                  role="alert"
                >
                  {draftConflicts.map((conflict) => (
                    <p
                      key={`${conflict.firstId}-${conflict.secondId}-${conflict.date}`}
                      className="m-0"
                    >
                      <TriangleAlert className="mr-1 inline size-3.5" aria-hidden="true" />
                      {conflict.detail}
                    </p>
                  ))}
                </div>
              )}

              {error && (
                <p className="hint !text-danger" role="alert">
                  {error}
                </p>
              )}
              {notice && <p className="hint !text-fairway">{notice}</p>}

              {editing && (
                <div className="grid gap-2 border-t border-line pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="m-0 font-semibold">Email reminders</p>
                      <p className="hint m-0">
                        {emails.filter((email) => email.status === "queued").length} queued ·{" "}
                        {emails.filter((email) => email.status === "sent").length} sent ·{" "}
                        {emails.filter((email) => email.status === "failed").length} failed
                      </p>
                    </div>
                    <Mail className="size-4 text-fairway" aria-hidden="true" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={emailBusy}
                      onClick={() => void queueEmails("confirmation")}
                    >
                      Queue confirmations
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={emailBusy}
                      onClick={() => void queueEmails("reminder")}
                    >
                      Queue reminders
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={emailBusy || !emails.some((email) => email.status === "queued")}
                      onClick={() => void sendEmails()}
                    >
                      <Send aria-hidden="true" /> Send queued
                    </Button>
                    {emails.some((email) => email.status === "failed") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={emailBusy}
                        onClick={() => void retryEmails()}
                      >
                        Retry failed
                      </Button>
                    )}
                  </div>
                  {emails.length > 0 && (
                    <div className="max-h-40 overflow-auto rounded-lg border border-line">
                      {emails.slice(0, 12).map((email) => (
                        <p
                          key={email.id}
                          className="m-0 flex items-center justify-between gap-2 border-b border-line px-2 py-1.5 text-[12px] last:border-b-0"
                        >
                          <span className="min-w-0 truncate">
                            {email.recipientName} · {email.kind}
                          </span>
                          <span
                            className={`pill ${email.status === "sent" ? "ok" : email.status === "failed" ? "bad" : ""}`}
                          >
                            {email.status}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                {editing && calendarLink && (
                  <a
                    href={calendarLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mr-auto text-[13px] font-semibold text-fairway underline-offset-2 hover:underline"
                  >
                    Add to Google Calendar
                  </a>
                )}
                {editing && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/setup">Setup &amp; dates</Link>
                  </Button>
                )}
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={busy || !draft.name.trim()}
                  onClick={() => void save()}
                >
                  {busy ? "Saving…" : error ? "Try save again" : "Save event"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
