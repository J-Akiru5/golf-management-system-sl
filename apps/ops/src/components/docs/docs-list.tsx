"use client";

import { Archive, ArchiveRestore, FileText, Pencil, Plus, Search, Trash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  createDocumentAction,
  deleteDocumentAction,
  renameDocumentAction,
  setDocumentArchivedAction,
} from "@/app/(app)/docs/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/field";
import { formatWhen } from "@/lib/docs/format";
import type { DocSummary } from "@/lib/docs/repo";
import { ImportDocument } from "./import-document";

export type DocsListProps = {
  docs: DocSummary[];
  archived: boolean;
  search: string;
  /** False at view level: no new document, rename, archive or delete. */
  canEdit: boolean;
  canDelete: boolean;
};

export function DocsList({ docs, archived, search, canEdit, canDelete }: DocsListProps) {
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const toggleParams = new URLSearchParams();
  if (search) toggleParams.set("q", search);
  if (!archived) toggleParams.set("archived", "1");
  const toggleQuery = toggleParams.toString();
  const toggleHref = toggleQuery ? `/docs?${toggleQuery}` : "/docs";
  const clearHref = archived ? "/docs?archived=1" : "/docs";

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setNewError(null);
    const result = await createDocumentAction(newTitle);
    setCreating(false);
    if (!result.ok) {
      setNewError(result.error);
      return;
    }
    setNewOpen(false);
    setNewTitle("");
    router.push(`/docs/${result.value.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <form action="/docs" method="get" className="flex min-w-56 flex-1 items-center gap-2">
          {archived ? <input type="hidden" name="archived" value="1" /> : null}
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <Input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Search titles"
              aria-label="Search documents by title"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        <Button variant="secondary" asChild>
          <Link href={toggleHref}>
            {archived ? <ArchiveRestore /> : <Archive />}
            {archived ? "Show active" : "Show archived"}
          </Link>
        </Button>

        {canEdit ? (
          <>
            <ImportDocument />
            <Button
              variant="primary"
              onClick={() => {
                setNewTitle("");
                setNewError(null);
                setNewOpen(true);
              }}
            >
              <Plus />
              New document
            </Button>
          </>
        ) : null}
      </div>

      {search ? (
        <p className="hint">
          Showing documents whose title matches &quot;{search}&quot;.{" "}
          <Link href={clearHref}>Clear the search</Link>
        </p>
      ) : null}

      {docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={
            search
              ? "No document matches that search"
              : archived
                ? "Nothing is archived"
                : "No documents yet"
          }
          action={
            search || archived ? (
              <Button variant="secondary" asChild>
                <Link href={clearHref}>
                  {search ? "Clear the search" : "Back to active documents"}
                </Link>
              </Button>
            ) : canEdit ? (
              <Button variant="primary" onClick={() => setNewOpen(true)}>
                <Plus />
                New document
              </Button>
            ) : undefined
          }
        >
          {search
            ? "Try a shorter word, or clear the search to see every document."
            : archived
              ? "Archiving keeps a document out of the way without deleting it."
              : canEdit
                ? "A document is shared with the whole workspace. Create one to start writing."
                : "Documents other people create appear here."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {docs.map((doc) => (
            <DocRow key={doc.id} doc={doc} canEdit={canEdit} canDelete={canDelete} />
          ))}
        </ul>
      )}

      <Dialog open={canEdit && newOpen} onOpenChange={setNewOpen}>
        <DialogContent
          title="New document"
          description="Everyone in the workspace can open and edit it."
        >
          <form onSubmit={createDocument} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-doc-title">Title</Label>
              <Input
                id="new-doc-title"
                value={newTitle}
                maxLength={200}
                required
                onChange={(event) => setNewTitle(event.target.value)}
              />
            </div>
            {newError ? (
              <p role="alert" className="text-sm text-danger">
                {newError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" variant="primary" disabled={creating}>
                {creating ? "Creating..." : "Create and open"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocRow({
  doc,
  canEdit,
  canDelete,
}: {
  doc: DocSummary;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(doc.title);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await renameDocumentAction(doc.id, name);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRenameOpen(false);
    router.refresh();
  }

  async function toggleArchive() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await setDocumentArchivedAction(doc.id, !doc.archived);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await deleteDocumentAction(doc.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDeleteOpen(false);
    router.refresh();
  }

  return (
    <li>
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/docs/${doc.id}`}
              className="font-display text-lg font-bold text-ink hover:underline"
            >
              {doc.title}
            </Link>
            {doc.archived ? <Badge tone="neutral">Archived</Badge> : null}
          </div>
          <p className="hint tnum mt-1">
            Edited {formatWhen(doc.updatedAt)}
            {doc.lastEditedByName ? ` by ${doc.lastEditedByName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" asChild>
            <Link href={`/docs/${doc.id}`}>Open</Link>
          </Button>
          {canEdit ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setName(doc.title);
                  setError(null);
                  setRenameOpen(true);
                }}
              >
                <Pencil />
                Rename
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void toggleArchive()}
              >
                {doc.archived ? <ArchiveRestore /> : <Archive />}
                {doc.archived ? "Unarchive" : "Archive"}
              </Button>
            </>
          ) : null}
          {canEdit && canDelete ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={() => {
                setError(null);
                setDeleteOpen(true);
              }}
            >
              <Trash />
              Delete
            </Button>
          ) : null}
        </div>
      </Card>

      {error && !renameOpen && !deleteOpen ? (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent title="Rename document" description="The new title is visible to everyone.">
          <form onSubmit={rename} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`rename-${doc.id}`}>Title</Label>
              <Input
                id={`rename-${doc.id}`}
                value={name}
                maxLength={200}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Saving..." : "Save title"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent
          title="Delete document"
          description="The document and all of its saved versions go away."
        >
          <p className="text-sm text-ink">Delete &quot;{doc.title}&quot;? This cannot be undone.</p>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="danger" disabled={busy} onClick={() => void remove()}>
              {busy ? "Deleting..." : "Delete document"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}
