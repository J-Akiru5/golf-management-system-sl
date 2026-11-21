"use client";

import type { Editor } from "@tiptap/react";
import { FilePlus } from "lucide-react";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/field";
import {
  IMPORT_ACCEPT,
  IMPORT_MAX_BYTES,
  IMPORT_PDF_MAX_BYTES,
  importHtmlToJson,
  prepareImport,
} from "@/lib/docs/import";

const SIZE_HINT = `${IMPORT_MAX_BYTES / (1024 * 1024)} MB`;
const PDF_SIZE_HINT = `${IMPORT_PDF_MAX_BYTES / (1024 * 1024)} MB`;

/**
 * Insert the text of a file into an open document.
 *
 * The conversion is the same one the Import dialog uses, and the content goes in through the
 * editor's own commands. That makes it an ordinary collaborative edit: every open editor receives
 * it, and the document's normal saving keeps it.
 *
 * The button is only for people who can edit documents. A viewer sees nothing.
 */
export function InsertFromFile({ editor, canEdit }: { editor: Editor; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [prepared, setPrepared] = useState<ReturnType<typeof importHtmlToJson>>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [inserting, setInserting] = useState(false);

  if (!canEdit) return null;

  const busy = reading || inserting;

  function reset() {
    setFile(null);
    setPrepared(null);
    setError(null);
    setReading(false);
    setInserting(false);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const chosen = input.files?.[0] ?? null;
    setFile(null);
    setPrepared(null);
    setError(null);
    setNotice(null);
    if (chosen === null) return;

    setReading(true);
    try {
      const converted = await prepareImport(chosen);
      const content = importHtmlToJson(converted.html);
      if (content === null)
        throw new Error("That file could not be turned into text the editor can hold.");
      setFile(chosen);
      setPrepared(content);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That file could not be read.");
      input.value = "";
    } finally {
      setReading(false);
    }
  }

  function insert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (file === null || prepared === null) {
      setError("Choose a file first.");
      return;
    }

    setInserting(true);
    setError(null);
    try {
      const content = Array.isArray(prepared.content) ? prepared.content : [];
      if (content.length === 0) throw new Error("empty");
      const inserted = editor.chain().focus().insertContent(content).run();
      if (!inserted) throw new Error("rejected");
    } catch {
      setInserting(false);
      setError("The text could not be placed in the document. Try again.");
      return;
    }

    setInserting(false);
    setNotice(`Inserted from ${file.name}.`);
    close();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setNotice(null);
          setOpen(true);
        }}
      >
        <FilePlus />
        Insert from file
      </Button>
      {notice ? (
        <span role="status" className="hint">
          {notice}
        </span>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else close();
        }}
      >
        <DialogContent
          title="Insert from file"
          description="The text is added to this document at the cursor. The file itself is not uploaded."
        >
          <form onSubmit={insert} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="insert-file">File</Label>
              <Input
                id="insert-file"
                type="file"
                accept={IMPORT_ACCEPT}
                disabled={busy}
                onChange={(event) => void chooseFile(event)}
                className="h-auto py-2.5 text-sm file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface-sunken file:px-3 file:text-sm file:font-semibold file:text-ink"
              />
              <p className="hint">
                HTML, Markdown or plain text up to {SIZE_HINT}, or a PDF up to {PDF_SIZE_HINT}.
                Scripts, styles and images are left out.
              </p>
              <p className="hint">Images and charts in a PDF are not imported.</p>
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
                <Button variant="ghost" disabled={inserting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || file === null || prepared === null}
              >
                {inserting ? "Inserting..." : "Insert"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
