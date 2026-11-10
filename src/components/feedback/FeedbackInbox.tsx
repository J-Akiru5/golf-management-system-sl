"use client";

import { MessageSquare, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  canTriageFeedback,
  DEFAULT_FEEDBACK_FILTERS,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUSES,
  type FeedbackFilters,
  type FeedbackNote,
  type FeedbackStatus,
  filterFeedback,
  sortFeedbackNewestFirst,
} from "@/lib/data/feedback";
import { loadFeedbackInbox, updateFeedbackStatus } from "@/lib/data/supabase/feedback";
import { loadDemoFeedback, updateDemoFeedbackStatus } from "@/lib/demo/feedback";
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

/**
 * The organizer's private feedback inbox.
 *
 * The page around this component already checked the session and the club membership. RLS is the
 * real guard: this component can read because the signed-in account is a club member, and it can
 * change a status only because the database update policy allows an owner or organizer. A desk
 * account sees the notes and the status select is replaced by a read-only line.
 */
export function FeedbackInbox({
  clubId,
  role,
  displayName,
}: {
  clubId: string;
  role: string;
  displayName: string;
}) {
  const manager = canTriageFeedback(role);
  const demo = !isSupabaseConfigured();
  const [rows, setRows] = useState<FeedbackNote[]>([]);
  const [filters, setFilters] = useState<FeedbackFilters>(DEFAULT_FEEDBACK_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
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

  const visible = useMemo(
    () => sortFeedbackNewestFirst(filterFeedback(rows, filters)),
    [rows, filters],
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
        setRows((current) => current.map((row) => (row.id === note.id ? updated : row)));
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

  return (
    <SectionCard
      id="feedback-inbox"
      icon={<MessageSquare />}
      title="Notes from the public feedback page"
      subtitle="Newest first. A note is private to club staff; nothing here appears on a public page."
      action={
        <Button variant="secondary" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
          <RefreshCw aria-hidden="true" />
          Refresh
        </Button>
      }
    >
      <p className="hint m-0">
        {manager
          ? `Signed in as ${displayName || "an organizer"}. You can move a note through new, read, planned, done and dismissed.`
          : "Read-only. An owner or organizer can change a note's status."}
      </p>

      {demo && (
        <p className="notice m-0" role="note">
          Demo preview: the notes below are sample and browser-only. Submit one from{" "}
          <a href="/feedback">/feedback</a> to see it arrive here.
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

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
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
              placeholder="Message, contact or page"
              className="w-full pl-9"
            />
          </span>
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
            {FEEDBACK_CATEGORIES.map((category) => (
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
                      {note.contactConsent && <span className="pill info">May reply</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : note.id)}
                      aria-expanded={open}
                      className="mt-2 block w-full text-left font-semibold text-ink"
                    >
                      {open ? note.message : short}
                    </button>
                  </div>
                  <time dateTime={note.createdAt} className="hint whitespace-nowrap">
                    {when(note.createdAt)}
                  </time>
                </div>

                {open && (
                  <div className="grid gap-3 border-t border-line pt-3">
                    <dl className="grid gap-2 sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="overline">Contact</dt>
                        <dd className="m-0 break-words text-[14px]">{contactLine(note)}</dd>
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
