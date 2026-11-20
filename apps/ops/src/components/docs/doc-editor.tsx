"use client";

import { type SupabasePersistence, SupabaseProvider } from "@supabase-labs/y-supabase";
import type { JSONContent } from "@tiptap/core";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowLeft, RotateCcw, Save } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import {
  claimSeedStateAction,
  createSnapshotAction,
  deleteSnapshotAction,
  listSnapshotsAction,
  renameDocumentAction,
} from "@/app/(app)/docs/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import type { EditorJson, WorkspaceRole } from "@/lib/db/types";
import {
  type ConnectionStatus,
  describeStatus,
  docProviderOptions,
  MAX_RECONNECT_ATTEMPTS,
  type PresenceUser,
  presenceUsers,
  SAVE_SETTLE_MS,
  type StatusTone,
  statusTone,
  userColor,
} from "@/lib/docs/collab";
import { toPlainJson } from "@/lib/docs/editor-json";
import { versionNameFor } from "@/lib/docs/format";
import { withPrivateDocChannels } from "@/lib/docs/private-client";
import type { DocSnapshot } from "@/lib/docs/repo";
import { planRestore, restoreNotice } from "@/lib/docs/restore";
import { encodeDocState } from "@/lib/docs/yjs-state";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/ui/cn";
import { EditorToolbar } from "./editor-toolbar";
import { HistorySheet } from "./history-sheet";
import { Presence } from "./presence";

export type DocEditorProps = {
  docId: string;
  title: string;
  archived: boolean;
  viewer: { id: string; displayName: string; role: WorkspaceRole };
  demo: boolean;
  canDelete: boolean;
  /** Converted content to import once, when the document has no state row. */
  seedContent: EditorJson | null;
  initialSnapshots: DocSnapshot[];
};

const DOT: Record<StatusTone, string> = {
  muted: "bg-ink-muted",
  ok: "bg-success",
  busy: "bg-warning",
  warn: "bg-warning",
  bad: "bg-danger",
};

/** The text area look: prose styles with tokens, plus the cursor and placeholder decoration. */
const EDITOR_BODY = cn(
  "min-h-[40vh] px-3 py-3 sm:px-5 sm:py-4",
  "[&_.tiptap]:min-h-[46vh] [&_.tiptap]:outline-none",
  "[&_p]:my-2 [&_p]:leading-7",
  "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-2xl",
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-xl",
  "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-lg",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:my-1",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-ink-muted",
  "[&_code]:rounded-sm [&_code]:bg-surface-sunken [&_code]:px-1",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-sunken [&_pre]:p-3",
  "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse",
  "[&_td]:border [&_td]:border-line [&_td]:p-2 [&_td]:align-top",
  "[&_th]:border [&_th]:border-line [&_th]:bg-surface-sunken [&_th]:p-2 [&_th]:text-left",
  "[&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-ink-muted [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
  "[&_.collaboration-carets__caret]:relative [&_.collaboration-carets__caret]:-ml-px [&_.collaboration-carets__caret]:-mr-px [&_.collaboration-carets__caret]:border-x",
  "[&_.collaboration-carets__label]:absolute [&_.collaboration-carets__label]:-top-5 [&_.collaboration-carets__label]:left-0 [&_.collaboration-carets__label]:whitespace-nowrap [&_.collaboration-carets__label]:rounded-sm [&_.collaboration-carets__label]:px-1 [&_.collaboration-carets__label]:text-[10px] [&_.collaboration-carets__label]:font-semibold [&_.collaboration-carets__label]:text-white",
);

function StatusLine({ tone, text }: { tone: StatusTone; text: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-ink-muted" aria-live="polite">
      <span aria-hidden="true" className={cn("size-2 flex-none rounded-full", DOT[tone])} />
      <span>{text}</span>
    </p>
  );
}

/**
 * The document page body. The title form works before the editor has mounted; the live part starts
 * on the client only, because Yjs, awareness and the realtime channel all need a browser.
 */
export function DocEditor({
  docId,
  title: initialTitle,
  archived,
  viewer,
  demo,
  canDelete,
  seedContent,
  initialSnapshots,
}: DocEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [savedTitle, setSavedTitle] = useState(initialTitle);
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const titleChanged = title.trim() !== savedTitle && title.trim().length > 0;

  async function commitTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!titleChanged || savingTitle) return;
    setSavingTitle(true);
    setTitleError(null);
    const result = await renameDocumentAction(docId, title);
    setSavingTitle(false);
    if (!result.ok) {
      setTitleError(result.error);
      return;
    }
    setSavedTitle(result.value.title);
    setTitle(result.value.title);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/docs"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All documents
        </Link>
        {archived ? <Badge tone="neutral">Archived</Badge> : null}
      </div>

      <form onSubmit={commitTitle} className="flex flex-wrap items-center gap-2">
        <Label htmlFor="doc-title" className="sr-only">
          Document title
        </Label>
        <Input
          id="doc-title"
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          className="h-12 max-w-2xl flex-1 font-display text-lg font-bold"
          aria-label="Document title"
        />
        {titleChanged ? (
          <Button type="submit" variant="secondary" size="sm" disabled={savingTitle}>
            {savingTitle ? "Saving..." : "Save title"}
          </Button>
        ) : null}
      </form>
      {titleError ? (
        <p role="alert" className="text-sm text-danger">
          {titleError}
        </p>
      ) : null}

      {mounted ? (
        <LiveDocument
          docId={docId}
          viewer={viewer}
          demo={demo}
          canDelete={canDelete}
          seedContent={seedContent}
          initialSnapshots={initialSnapshots}
        />
      ) : (
        <Card className="flex flex-col gap-3 p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-48 w-full" />
        </Card>
      )}
    </div>
  );
}

/**
 * The live part: a Y.Doc, awareness, the Supabase provider (not in demo mode), the editor, the
 * status line and the version history.
 */
function LiveDocument({
  docId,
  viewer,
  demo,
  canDelete,
  seedContent,
  initialSnapshots,
}: Omit<DocEditorProps, "title" | "archived">) {
  // One document and one awareness for the lifetime of this component. The doc is deliberately not
  // destroyed in effect cleanup: React runs effects twice in development, and the second run has to
  // keep working on the same document.
  const [session] = useState(() => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    awareness.setLocalStateField("user", {
      name: viewer.displayName,
      color: userColor(viewer.id),
    });
    return { doc, awareness };
  });

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [gaveUp, setGaveUp] = useState(false);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(false);
  const [hasEdits, setHasEdits] = useState(false);
  const [people, setPeople] = useState<PresenceUser[]>([]);
  const [canSeed, setCanSeed] = useState(demo && seedContent !== null);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versionName, setVersionName] = useState(() => versionNameFor(new Date()));

  const seeded = useRef(false);
  const claim = useRef<{ docId: string; settled: boolean; granted: boolean }>({
    docId,
    settled: false,
    granted: false,
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ undoRedo: false, heading: { levels: [1, 2, 3] } }),
      Collaboration.configure({ document: session.doc }),
      CollaborationCaret.configure({
        provider: { awareness: session.awareness },
        user: { name: viewer.displayName, color: userColor(viewer.id) },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: "Start writing. Everyone in this document sees it as you type.",
      }),
    ],
    editorProps: {
      attributes: {
        class: "focus:outline-none",
        "aria-label": "Document body",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
  });

  // Connection, persistence and the seed claim.
  useEffect(() => {
    const { doc, awareness } = session;
    let cancelled = false;
    let provider: SupabaseProvider | null = null;
    let persistence: SupabasePersistence | null = null;
    let errors = 0;

    function markPending() {
      setPending(true);
      setHasEdits(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setPending(false), SAVE_SETTLE_MS);
    }

    const onDocUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;
      if (persistence !== null && origin === persistence) return;
      markPending();
    };
    doc.on("update", onDocUpdate);

    function onStatus(next: ConnectionStatus) {
      setStatus(next);
      if (next === "connected") {
        errors = 0;
        setGaveUp(false);
      }
    }

    function onOnline() {
      setOnline(true);
    }
    function onOffline() {
      setOnline(false);
    }

    async function start() {
      setOnline(typeof navigator === "undefined" ? true : navigator.onLine);

      if (seedContent && !claim.current.settled) {
        claim.current.settled = true;
        if (demo) {
          claim.current.granted = true;
        } else {
          const result = await claimSeedStateAction(docId);
          if (cancelled) return;
          if (result.ok) claim.current.granted = result.value;
          else setFailure(result.error);
        }
        if (claim.current.granted) setCanSeed(true);
      }

      if (demo) {
        setStatus("connected");
        return;
      }

      try {
        const client = getBrowserSupabase();
        // The private channel carries the session's token, so set it before subscribing.
        await client.realtime.setAuth();
        if (cancelled) return;
        provider = new SupabaseProvider(
          docId,
          doc,
          withPrivateDocChannels(client),
          docProviderOptions({ awareness }),
        );
        persistence = provider.getPersistence();
        provider.on("status", onStatus);
        provider.on("error", () => {
          errors += 1;
          if (errors >= MAX_RECONNECT_ATTEMPTS) setGaveUp(true);
        });
        setStatus(provider.getStatus());
      } catch (error) {
        if (cancelled) return;
        setGaveUp(true);
        setFailure(error instanceof Error ? error.message : "The editor could not start.");
      }
    }

    void start();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      doc.off("update", onDocUpdate);
      provider?.destroy();
    };
  }, [demo, docId, seedContent, session]);

  // Presence: everyone whose awareness state carries a name and a colour.
  useEffect(() => {
    const { awareness } = session;
    const update = () => setPeople(presenceUsers(awareness.getStates()));
    awareness.on("change", update);
    awareness.on("update", update);
    update();
    return () => {
      awareness.off("change", update);
      awareness.off("update", update);
    };
  }, [session]);

  // Seed the converted first document once, and only into an empty live document.
  useEffect(() => {
    if (!editor || !canSeed || !seedContent || seeded.current) return;
    if (session.doc.getXmlFragment("default").length > 0) return;
    seeded.current = true;
    editor.commands.setContent(seedContent as unknown as JSONContent, { emitUpdate: true });
  }, [canSeed, editor, seedContent, session.doc]);

  async function refreshSnapshots() {
    const result = await listSnapshotsAction(docId);
    if (result.ok) setSnapshots(result.value);
    else setFailure(result.error);
  }

  async function saveVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || busy) return;
    setBusy(true);
    setFailure(null);
    const result = await createSnapshotAction({
      docId,
      name: versionName,
      kind: "manual",
      state: encodeDocState(session.doc),
      content: toPlainJson(editor.getJSON()) as unknown as EditorJson,
    });
    setBusy(false);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    setSaveOpen(false);
    setNotice(`Saved "${result.value.name}".`);
    await refreshSnapshots();
  }

  async function restoreVersion(snapshot: DocSnapshot) {
    if (!editor || busy) return;
    setBusy(true);
    setFailure(null);
    setNotice(null);

    // The plan is pure and tested: save the current state first, then apply the older content as a
    // new edit, so the history keeps both sides.
    for (const step of planRestore({ snapshot })) {
      if (step.op === "create_snapshot") {
        const result = await createSnapshotAction({
          docId,
          name: step.name,
          kind: step.kind,
          state: encodeDocState(session.doc),
          content: toPlainJson(editor.getJSON()) as unknown as EditorJson,
        });
        if (!result.ok) {
          setBusy(false);
          setFailure(result.error);
          return;
        }
      } else {
        editor.commands.setContent(step.content as unknown as JSONContent, { emitUpdate: true });
      }
    }

    setBusy(false);
    setNotice(restoreNotice(snapshot.name));
    await refreshSnapshots();
  }

  async function deleteVersion(snapshot: DocSnapshot) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const result = await deleteSnapshotAction(snapshot.id);
    setBusy(false);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    setNotice(`Deleted the version "${snapshot.name}".`);
    await refreshSnapshots();
  }

  const statusInput = { demo, online, gaveUp, status, pending, hasEdits };
  const statusText = describeStatus(statusInput);
  const tone = statusTone(statusInput);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <StatusLine tone={tone} text={statusText} />
        <Presence users={people} />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setVersionName(versionNameFor(new Date()));
              setSaveOpen(true);
            }}
          >
            <Save />
            Save version
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}>
            <RotateCcw />
            History
            {snapshots.length > 0 ? <span className="tnum">({snapshots.length})</span> : null}
          </Button>
        </div>
      </div>

      {editor ? <EditorToolbar editor={editor} /> : <Skeleton className="h-12 w-full" />}

      <Card className={EDITOR_BODY}>
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
          </div>
        )}
      </Card>

      <p className="hint">
        Changes are shared as you type. Save a version before a big change so you can return to it.
      </p>

      {notice ? (
        <p role="status" className="hint">
          {notice}
        </p>
      ) : null}
      {failure ? (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-ink"
        >
          {failure}
        </p>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {snapshots.length > 0 ? `${snapshots.length} saved versions.` : "No saved versions."}
      </p>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent
          title="Save a version"
          description="The version keeps the document exactly as it is now. You can restore it later."
        >
          <form onSubmit={saveVersion} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="version-name">Version name</Label>
              <Input
                id="version-name"
                value={versionName}
                maxLength={120}
                required
                onChange={(event) => setVersionName(event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Saving..." : "Save version"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <HistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        snapshots={snapshots}
        busy={busy}
        canDelete={canDelete}
        onRestore={(snapshot) => void restoreVersion(snapshot)}
        onDelete={(snapshot) => void deleteVersion(snapshot)}
      />

      <p className="sr-only">
        Saved versions are immutable. Restoring one writes the current document to a &ldquo;Before
        restore&rdquo; version first, then applies the older content.
      </p>
    </div>
  );
}
