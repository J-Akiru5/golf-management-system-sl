"use client";

import { Mail, MessageSquare, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { concernSummary } from "@/lib/data/concerns";
import {
  canTriageFeedback,
  DEFAULT_FEEDBACK_FILTERS,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_INBOX_CATEGORIES,
  FEEDBACK_RESOLUTION_NOTE_MAX,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUSES,
  type FeedbackFilters,
  type FeedbackNote,
  type FeedbackStatus,
  filterFeedback,
  normalizeFeedbackResolutionNote,
  sortFeedbackNewestFirst,
} from "@/lib/data/feedback";
import {
  loadFeedbackInbox,
  updateFeedbackResolution,
  updateFeedbackStatus,
} from "@/lib/data/supabase/feedback";
import {
  loadDemoFeedback,
  updateDemoFeedbackResolution,
  updateDemoFeedbackStatus,
} from "@/lib/demo/feedback";
import { notifyFeedbackChanged } from "@/lib/feedback-events";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { cn } from "@/lib/ui/cn";

const STATUS_TONE: Record<FeedbackStatus, string> = {
  new: "gold",
  read: "info",
  planned: "warn",
  done: "ok",
  dismissed: "",
};

interface DigestResponse {
  configured?: boolean;
  queued?: boolean;
  message?: string;
}

function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function contactLine(note: FeedbackNote): string {
  const parts = [note.contactName, note.contactEmail].filter(
    (part): part is string => part !== null && part !== "",
  );
  return parts.length > 0 ? parts.join(" · ") : "No contact details";
}

function eventLabel(note: FeedbackNote): string {
  if (note.eventName) return note.eventName;
  return note.tournamentId ? "Event name unavailable" : "General feedback (no event)";
}

/** The one line a concern leads with, for example "Score (hole 7), Tee off (White)". */
function concernLine(note: FeedbackNote): string | null {
  return note.details ? concernSummary(note.details) : null;
}

/** The concern's own answers, in the desk's words. A missing answer is left out, not guessed. */
function concernFacts(note: FeedbackNote): { term: string; value: string }[] {
  const details = note.details;
  if (!details) return [];
  const facts: { term: string; value: string }[] = [];
  if (details.playerName) facts.push({ term: "Player", value: details.playerName });
  if (details.handicap) facts.push({ term: "Handicap", value: details.handicap });
  if (details.schedule) facts.push({ term: "Schedule", value: details.schedule });
  facts.push({ term: "Sent from", value: details.source === "chat" ? "The chatbot" : "The form" });
  return facts;
}

/**
 * The organizer's private feedback inbox.
 *
 * The page around this component already checked the session and the club membership. RLS is the
 * real guard: this component can read because the signed-in account is a club member, and it can
 * change a status or a resolution note only because the database update policy allows an owner or
 * organizer. A desk account sees the notes and the edits are replaced by read-only text.
 */
export function FeedbackInbox({
  clubId,
  role,
  displayName,
  initialFilters = DEFAULT_FEEDBACK_FILTERS,
  digestConfigured = false,
}: {
  clubId: string;
  role: string;
  displayName: string;
  initialFilters?: FeedbackFilters;
  /** Server-side truth for the mail channel. The inbox works without it. */
  digestConfigured?: boolean;
}) {
  const manager = canTriageFeedback(role);
  const demo = !isSupabaseConfigured();
  const [rows, setRows] = useState<FeedbackNote[]>([]);
  const [filters, setFilters] = useState<FeedbackFilters>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [resolutionDraft, setResolutionDraft] = useState("");
  const [mailReady, setMailReady] = useState(digestConfigured);
  const [digestBusy, setDigestBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (demo) {
      setRows(loadDemoFeedback());
      setLoading(false);
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    void loadFeedbackInbox(createSupabaseBrowserClient(), clubId, { limit: 300 })
      .then((notes) => {
        if (!active) return;
        setRows(notes);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error ? loadError.message : "The feedback inbox could not load.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [clubId, demo, reloadKey]);

  const counts = useMemo(() => {
    const next: Record<FeedbackStatus | "all", number> = {
      all: rows.length,
      new: 0,
      read: 0,
      planned: 0,
      done: 0,
      dismissed: 0,
    };
    for (const row of rows) next[row.status] += 1;
    return next;
  }, [rows]);

  const eventOptions = useMemo(() => {
    const next = new Map<string, string>();
    for (const row of rows) {
      if (!row.tournamentId) continue;
      next.set(row.tournamentId, row.eventName ?? "Event name unavailable");
    }
    if (filters.event !== "all" && !next.has(filters.event)) {
      next.set(filters.event, "Selected event");
    }
    return [...next.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [rows, filters.event]);

  const visible = useMemo(
    () => sortFeedbackNewestFirst(filterFeedback(rows, filters)),
    [rows, filters],
  );

  const toggleOpen = useCallback(
    (note: FeedbackNote) => {
      if (openId === note.id) {
        setOpenId(null);
        setResolutionDraft("");
        return;
      }
      setOpenId(note.id);
      setResolutionDraft(note.resolutionNote ?? "");
    },
    [openId],
  );

  const changeStatus = useCallback(
    async (note: FeedbackNote, status: FeedbackStatus) => {
      if (!manager || pendingId !== null || status === note.status) return;
      const previous = note;
      setPendingId(note.id);
      setError("");
      setNotice("");
      // Optimistic: the note moves at once. A refusal puts the old row back and shows why.
      setRows((current) => current.map((row) => (row.id === note.id ? { ...row, status } : row)));
      if (demo) {
        const updated = updateDemoFeedbackStatus(note.id, status);
        if (updated) {
          setRows((current) => current.map((row) => (row.id === note.id ? updated : row)));
        }
        notifyFeedbackChanged();
        setNotice(`Status changed to ${FEEDBACK_STATUS_LABELS[status]}. This is a local preview.`);
        setPendingId(null);
        return;
      }
      try {
        const updated = await updateFeedbackStatus(
          createSupabaseBrowserClient(),
          clubId,
          note.id,
          status,
        );
        setRows((current) =>
          current.map((row) =>
            row.id === note.id
              ? { ...updated, eventName: updated.eventName ?? row.eventName }
              : row,
          ),
        );
        notifyFeedbackChanged();
        setNotice(`Status changed to ${FEEDBACK_STATUS_LABELS[status]}.`);
      } catch (updateError) {
        setRows((current) => current.map((row) => (row.id === note.id ? previous : row)));
        setError(
          updateError instanceof Error
            ? updateError.message
            : "The status could not be changed. Try again.",
        );
      } finally {
        setPendingId(null);
      }
    },
    [clubId, demo, manager, pendingId],
  );

  const saveResolution = useCallback(
    async (note: FeedbackNote, draft: string = resolutionDraft) => {
      if (!manager || pendingId !== null) return;
      const normalized = normalizeFeedbackResolutionNote(draft);
      if (!normalized.ok) {
        setError(
          `Keep the resolution note to ${FEEDBACK_RESOLUTION_NOTE_MAX} characters or fewer.`,
        );
        return;
      }
      if (normalized.value === note.resolutionNote) {
        setResolutionDraft(normalized.value ?? "");
        setNotice("No change to save.");
        return;
      }

      const previous = note;
      setPendingId(note.id);
      setError("");
      setNotice("");
      const optimistic: FeedbackNote = {
        ...note,
        resolutionNote: normalized.value,
        resolutionNoteUpdatedAt: new Date().toISOString(),
        resolutionNoteUpdatedBy: null,
      };
      setRows((current) => current.map((row) => (row.id === note.id ? optimistic : row)));
      setResolutionDraft(normalized.value ?? "");

      if (demo) {
        const updated = updateDemoFeedbackResolution(note.id, normalized.value);
        if (updated) {
          setRows((current) => current.map((row) => (row.id === note.id ? updated : row)));
          setResolutionDraft(updated.resolutionNote ?? "");
        }
        notifyFeedbackChanged();
        setNotice("Resolution note saved. This is a local preview.");
        setPendingId(null);
        return;
      }

      try {
        const updated = await updateFeedbackResolution(
          createSupabaseBrowserClient(),
          clubId,
          note.id,
          normalized.value,
        );
        setRows((current) =>
          current.map((row) =>
            row.id === note.id
              ? { ...updated, eventName: updated.eventName ?? row.eventName }
              : row,
          ),
        );
        setResolutionDraft(updated.resolutionNote ?? "");
        notifyFeedbackChanged();
        setNotice("Resolution note saved.");
      } catch (saveError) {
        setRows((current) => current.map((row) => (row.id === note.id ? previous : row)));
        setResolutionDraft(previous.resolutionNote ?? "");
        setError(
          saveError instanceof Error
            ? saveError.message
            : "The resolution note could not be saved. Try again.",
        );
      } finally {
        setPendingId(null);
      }
    },
    [clubId, demo, manager, pendingId, resolutionDraft],
  );

  const queueDigest = useCallback(async () => {
    if (!mailReady || digestBusy) return;
    setDigestBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/feedback/digest", { method: "POST" });
      const result = (await response.json().catch(() => null)) as DigestResponse | null;
      if (result?.configured === false) {
        setMailReady(false);
        setNotice(result.message ?? "Email is not configured. The inbox still works.");
        return;
      }
      if (!response.ok) {
        setError(result?.message ?? "The digest could not be queued. Try again.");
        return;
      }
      setNotice(result?.message ?? "The feedback digest was queued.");
    } catch {
      setError("The digest could not be queued. Check your connection and try again.");
    } finally {
      setDigestBusy(false);
    }
  }, [digestBusy, mailReady]);

  return (
    <SectionCard
      id="feedback-inbox"
      icon={<MessageSquare />}
      title="Notes from the public feedback page"
      subtitle="Newest first. A note is private to club staff; nothing here appears on a public page."
      action={
        <div className="flex flex-wrap gap-2">
          {manager && !demo && mailReady && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void queueDigest()}
              disabled={digestBusy}
            >
              <Mail aria-hidden="true" />
              {digestBusy ? "Queuing…" : "Queue digest"}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        </div>
      }
    >
      <p className="hint m-0">
        {manager
          ? `Signed in as ${displayName || "an organizer"}. You can move a note through new, read, planned, done and dismissed, and keep a private resolution note.`
          : "Read-only. An owner or organizer can change a note's status or resolution note."}
      </p>

      {demo && (
        <p className="notice m-0" role="note">
          Demo preview: the notes below are sample and browser-only. Submit one from{" "}
          <a href="/feedback">/feedback</a> to see it arrive here.
        </p>
      )}

      {manager && !demo && !mailReady && (
        <p className="hint m-0">
          Email is not configured on this deployment, so the digest is unavailable. The inbox still
          works without it.
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        <button
          type="button"
          aria-pressed={filters.status === "all"}
          onClick={() => setFilters((current) => ({ ...current, status: "all" }))}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
            filters.status === "all"
              ? "border-fairway bg-fairway-soft font-semibold text-ink"
              : "border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken",
          )}
        >
          All
          <span className="text-xs text-ink-muted tnum">{counts.all}</span>
        </button>
        {FEEDBACK_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={filters.status === status}
            onClick={() => setFilters((current) => ({ ...current, status }))}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
              filters.status === status
                ? "border-fairway bg-fairway-soft font-semibold text-ink"
                : "border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken",
            )}
          >
            {FEEDBACK_STATUS_LABELS[status]}
            <span className="text-xs text-ink-muted tnum">{counts[status]}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_14rem]">
        <label className="field">
          <span>Search notes</span>
          <span className="relative block">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={filters.query}
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
              placeholder="Message, contact, page or event"
              className="w-full pl-9"
            />
          </span>
        </label>
        <label className="field">
          <span>Event</span>
          <select
            value={filters.event}
            onChange={(event) =>
              setFilters((current) => ({ ...current, event: event.target.value }))
            }
          >
            <option value="all">Every event</option>
            {eventOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Category</span>
          <select
            value={filters.category}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                category: event.target.value as FeedbackFilters["category"],
              }))
            }
          >
            <option value="all">Every category</option>
            {FEEDBACK_INBOX_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {FEEDBACK_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="notice bad" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}

      {loading ? (
        <p className="muted">Loading notes…</p>
      ) : error && rows.length === 0 ? null : visible.length === 0 ? (
        <div className="notice" role="status">
          {rows.length === 0
            ? "No feedback has been sent yet. The public form is at /feedback."
            : "No notes match these filters. Clear a filter or the search to see the rest."}
        </div>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5" aria-label="Feedback notes">
          {visible.map((note) => {
            const open = openId === note.id;
            const summary = concernLine(note);
            const facts = concernFacts(note);
            const transcript = note.details?.transcript ?? [];
            const short =
              note.message.length > 140 ? `${note.message.slice(0, 140).trimEnd()}…` : note.message;
            return (
              <li key={note.id} className="card grid gap-3 !p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="pill">{FEEDBACK_CATEGORY_LABELS[note.category]}</span>
                      <span className={`pill ${STATUS_TONE[note.status]}`}>
                        {FEEDBACK_STATUS_LABELS[note.status]}
                      </span>
                      {note.tournamentId && <span className="pill info">{eventLabel(note)}</span>}
                      {note.contactConsent && <span className="pill info">May reply</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleOpen(note)}
                      aria-expanded={open}
                      className="mt-2 block w-full text-left font-semibold text-ink"
                    >
                      {open ? (summary ?? note.message) : (summary ?? short)}
                    </button>
                    {summary && note.message !== summary && (
                      <p className="hint m-0 mt-1">{open ? note.message : short}</p>
                    )}
                  </div>
                  <time dateTime={note.createdAt} className="hint whitespace-nowrap">
                    {when(note.createdAt)}
                  </time>
                </div>

                {open && (
                  <div className="grid gap-3 border-t border-line pt-3">
                    {summary && (
                      <div className="grid gap-2 border-b border-line pb-3">
                        <p className="overline m-0">Concern</p>
                        <p className="m-0 text-[14px] whitespace-pre-wrap">{summary}</p>
                        {facts.length > 0 && (
                          <dl className="grid gap-2 sm:grid-cols-2">
                            {facts.map((fact) => (
                              <div className="min-w-0" key={fact.term}>
                                <dt className="overline">{fact.term}</dt>
                                <dd className="m-0 break-words text-[14px]">{fact.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {transcript.length > 0 && (
                          <details>
                            <summary className="cursor-pointer font-semibold text-ink">
                              {`The conversation (${transcript.length} ${transcript.length === 1 ? "turn" : "turns"})`}
                            </summary>
                            <ol className="mt-2 grid gap-2">
                              {transcript.map((turn, index) => (
                                <li className="text-[14px]" key={`${index}-${turn.role}`}>
                                  <b>{turn.role === "user" ? "Player" : "Assistant"}:</b>{" "}
                                  <span className="whitespace-pre-wrap">{turn.content}</span>
                                </li>
                              ))}
                            </ol>
                          </details>
                        )}
                      </div>
                    )}
                    <dl className="grid gap-2 sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="overline">Contact</dt>
                        <dd className="m-0 break-words text-[14px]">{contactLine(note)}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="overline">Event</dt>
                        <dd className="m-0 break-words text-[14px]">{eventLabel(note)}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="overline">Page</dt>
                        <dd className="m-0 break-words text-[14px]">
                          {note.pagePath ?? "Not recorded"}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="overline">Language</dt>
                        <dd className="m-0 text-[14px]">{note.locale.toUpperCase()}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="overline">Status changed</dt>
                        <dd className="m-0 text-[14px]">
                          {note.statusChangedAt ? when(note.statusChangedAt) : "Not changed yet"}
                        </dd>
                      </div>
                    </dl>

                    {manager ? (
                      <label className="field max-w-xs">
                        <span>Status</span>
                        <select
                          value={note.status}
                          disabled={pendingId !== null}
                          onChange={(event) =>
                            void changeStatus(note, event.target.value as FeedbackStatus)
                          }
                        >
                          {FEEDBACK_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {FEEDBACK_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </select>
                        {pendingId === note.id && <span className="hint">Saving…</span>}
                      </label>
                    ) : (
                      <p className="hint m-0">
                        {`Status: ${FEEDBACK_STATUS_LABELS[note.status]}. Only an owner or organizer can change it.`}
                      </p>
                    )}

                    <div className="grid gap-2 border-t border-line pt-3">
                      <p className="overline m-0">Resolution note</p>
                      {manager ? (
                        <>
                          <label className="field">
                            <span className="sr">Resolution note</span>
                            <textarea
                              value={resolutionDraft}
                              rows={3}
                              maxLength={FEEDBACK_RESOLUTION_NOTE_MAX}
                              disabled={pendingId !== null}
                              onChange={(event) => setResolutionDraft(event.target.value)}
                              placeholder="What was decided, and who is doing it?"
                            />
                          </label>
                          <div className="row">
                            <Button
                              size="sm"
                              onClick={() => void saveResolution(note)}
                              disabled={pendingId !== null}
                            >
                              Save note
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void saveResolution(note, "")}
                              disabled={
                                pendingId !== null ||
                                (resolutionDraft === "" && note.resolutionNote === null)
                              }
                            >
                              Clear
                            </Button>
                            {pendingId === note.id && <span className="hint">Saving…</span>}
                          </div>
                          <p className="hint m-0">
                            Only club staff can read this note. It never appears on a public page.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="m-0 text-[14px] whitespace-pre-wrap">
                            {note.resolutionNote ?? "No resolution note yet."}
                          </p>
                          {note.resolutionNoteUpdatedAt && (
                            <p className="hint m-0">
                              Updated {when(note.resolutionNoteUpdatedAt)}. Only an owner or
                              organizer can change it.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
