"use client";

import { generateJSON } from "@tiptap/core";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { createDocumentAction, deleteDocumentAction } from "@/app/(app)/docs/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/field";
import type { EditorJson } from "@/lib/db/types";
import { toPlainJson } from "@/lib/docs/editor-json";
import {
  type ConvertedImport,
  checkImportFile,
  convertDocument,
  IMPORT_ACCEPT,
  IMPORT_MAX_BYTES,
  importVersionName,
} from "@/lib/docs/import";
import { savePendingImport } from "@/lib/docs/pending-import";

/**
 * The same extensions the editor uses, so the converted HTML is checked against the schema it will
 * be opened with. The heading levels match doc-editor.tsx.
 */
const PARSE_EXTENSIONS = [
  StarterKit.configure({ undoRedo: false, heading: { levels: [1, 2, 3] } }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];

const SIZE_HINT = `${IMPORT_MAX_BYTES / (1024 * 1024)} MB`;

/**
 * The Import action beside "New document". The file is read and converted in this browser; only the
 * converted document is created. If anything fails after the document exists, the document is
 * removed again so an empty one is never left behind.
 */
export function ImportDocument() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [prepared, setPrepared] = useState<ConvertedImport | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);

  const busy = reading || importing;

  function reset() {
    setFile(null);
    setPrepared(null);
    setTitle("");
    setError(null);
    setReading(false);
    setImporting(false);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const chosen = input.files?.[0] ?? null;
    setPrepared(null);
    setTitle("");
    setError(null);
    setFile(chosen);
    if (chosen === null) return;

    const check = checkImportFile({ name: chosen.name, size: chosen.size });
    if (!check.ok) {
      setFile(null);
      setError(check.error);
      input.value = "";
      return;
    }

    setReading(true);
    try {
      const text = await chosen.text();
      const converted = convertDocument({ name: chosen.name, kind: check.kind, text });
      if (converted.html.trim().length === 0) {
        setFile(null);
        setError("That file has no text to import.");
        input.value = "";
        return;
      }
      setPrepared(converted);
    } catch (cause) {
      setFile(null);
      setError(cause instanceof Error ? cause.message : "That file could not be read.");
      input.value = "";
    } finally {
      setReading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (file === null || prepared === null) {
      setError("Choose a file first.");
      return;
    }

    setImporting(true);
    setError(null);

    let content: EditorJson;
    try {
      const parsed = generateJSON(prepared.html, PARSE_EXTENSIONS) as EditorJson;
      const blocks = Array.isArray(parsed.content) ? parsed.content : [];
      if (blocks.length === 0) throw new Error("empty");
      content = toPlainJson(parsed);
    } catch {
      setImporting(false);
      setError("That file could not be turned into a document. Check that it holds readable text.");
      return;
    }

    const result = await createDocumentAction(
      title.trim().length > 0 ? title.trim() : prepared.title,
    );
    if (!result.ok) {
      setImporting(false);
      setError(result.error);
      return;
    }

    const docId = result.value.id;
    const stored = savePendingImport(docId, {
      content,
      versionName: importVersionName(file.name),
    });
    if (!stored) {
      const removal = await deleteDocumentAction(docId);
      setImporting(false);
      setError(
        removal.ok
          ? "This browser could not hold the converted text, so no document was created."
          : `This browser could not hold the converted text, and the empty document could not be removed: ${removal.error}`,
      );
      return;
    }

    setImporting(false);
    close();
    router.push(`/docs/${docId}`);
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <FileUp />
        Import
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else close();
        }}
      >
        <DialogContent
          title="Import a document"
          description="The text is copied into a new document. The file itself is not uploaded."
        >
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-file">File</Label>
              <Input
                id="import-file"
                type="file"
                accept={IMPORT_ACCEPT}
                disabled={busy}
                onChange={(event) => void chooseFile(event)}
                className="h-auto py-2.5 text-sm file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface-sunken file:px-3 file:text-sm file:font-semibold file:text-ink"
              />
              <p className="hint">
                HTML, Markdown or plain text, up to {SIZE_HINT}. Scripts, styles and images are left
                out.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-title">Title (optional)</Label>
              <Input
                id="import-title"
                value={title}
                maxLength={200}
                disabled={busy}
                placeholder={prepared?.title ?? "The first heading, or the file name"}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            {reading ? (
              <p role="status" className="hint">
                Reading the file...
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost" disabled={importing}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || file === null || prepared === null}
              >
                {importing ? "Importing..." : "Import and open"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
