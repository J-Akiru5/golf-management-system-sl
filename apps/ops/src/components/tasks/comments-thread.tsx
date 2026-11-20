"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { canDeleteComment, canEditComment, type Viewer } from "@/lib/db/permissions";
import type { WsTaskCommentRow } from "@/lib/db/types";
import { messageOf, unwrap } from "@/lib/tasks/result";
import type { TaskActions, TaskViewer } from "@/lib/tasks/types";

export type CommentActions = Pick<
  TaskActions,
  "listComments" | "addComment" | "editComment" | "deleteComment"
>;

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function authorName(authorId: string | null, memberNames: ReadonlyMap<string, string>): string {
  if (authorId === null) return "Former member";
  return memberNames.get(authorId) ?? "Former member";
}

/**
 * The comment thread on one task.
 *
 * `refreshKey` is bumped by the live feed: a comment event for this task asks the thread to read
 * again, rather than trying to rebuild the list from a broadcast payload.
 */
export function CommentsThread({
  taskId,
  memberNames,
  viewer,
  actions,
  refreshKey,
}: {
  taskId: string;
  memberNames: ReadonlyMap<string, string>;
  viewer: TaskViewer;
  actions: CommentActions;
  refreshKey: number;
}) {
  const [comments, setComments] = useState<WsTaskCommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const permissionViewer: Viewer = { role: viewer.role, status: "active" };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    unwrap(actions.listComments(taskId))
      .then((rows) => {
        if (active) setComments(rows);
      })
      .catch((cause: unknown) => {
        if (active) setError(messageOf(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [taskId, refreshKey, actions]);

  async function handleAdd() {
    const body = draft.trim();
    if (body === "") {
      setError("A comment needs some words.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const row = await unwrap(actions.addComment(taskId, body));
      setComments((current) => [...current, row]);
      setDraft("");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit(id: string) {
    const body = editDraft.trim();
    if (body === "") {
      setError("A comment needs some words.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const row = await unwrap(actions.editComment(id, body));
      setComments((current) => current.map((comment) => (comment.id === id ? row : comment)));
      setEditingId(null);
      setEditDraft("");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await unwrap(actions.deleteComment(id));
      setComments((current) => current.filter((comment) => comment.id !== id));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="task-comments-heading" className="flex flex-col gap-3">
      <h3 id="task-comments-heading" className="font-display text-base font-bold text-ink">
        Comments
      </h3>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {!loading && comments.length === 0 ? <p className="hint">No comments yet.</p> : null}

      <ul className="flex flex-col gap-2">
        {comments.map((comment) => {
          const name = authorName(comment.author_id, memberNames);
          const canEdit = canEditComment(permissionViewer, viewer.id, comment.author_id);
          const canDelete = canDeleteComment(permissionViewer, viewer.id, comment.author_id);
          const editing = editingId === comment.id;

          return (
            <li key={comment.id} className="rounded-md border border-line bg-surface-raised p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar id={comment.author_id ?? "unknown"} name={name} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">{name}</p>
                    <p className="text-[11px] text-ink-muted">
                      {when(comment.created_at)}
                      {comment.edited_at ? " · Edited" : ""}
                    </p>
                  </div>
                </div>
                {canEdit || canDelete ? (
                  <div className="flex gap-1">
                    {canEdit && !editing ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-11"
                        onClick={() => {
                          setEditingId(comment.id);
                          setEditDraft(comment.body);
                          setError(null);
                        }}
                      >
                        Edit
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-11 text-danger"
                        disabled={busy}
                        onClick={() => void handleDelete(comment.id)}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {editing ? (
                <div className="mt-2 flex flex-col gap-2">
                  <Textarea
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                    rows={3}
                    aria-label="Edit comment"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="h-11"
                      disabled={busy}
                      onClick={() => void handleEdit(comment.id)}
                    >
                      Save
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-11"
                      onClick={() => {
                        setEditingId(null);
                        setEditDraft("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{comment.body}</p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          aria-label="New comment"
          placeholder="Add a comment"
        />
        <div>
          <Button variant="secondary" disabled={busy} onClick={() => void handleAdd()}>
            Add comment
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
