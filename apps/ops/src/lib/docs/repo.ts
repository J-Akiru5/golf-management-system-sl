import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EditorJson, SnapshotKind } from "@/lib/db/types";
import { isEditorJson } from "./editor-json";
import { emptyDocState } from "./yjs-state";

export { isEditorJson } from "./editor-json";

/**
 * Documents repository.
 *
 * The interface is what the pages and server actions use. There are two implementations: one on the
 * caller's Supabase session (RLS decides access, this file never re-implements it) and one in memory
 * for demo mode, seeded with three documents the interface can be checked against.
 *
 * A missing row is `null` or an empty list, never a made-up default.
 */

export const TITLE_MAX = 200;
export const SNAPSHOT_NAME_MAX = 120;

export type DocSummary = {
  id: string;
  title: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  /** Who last wrote to the document. Null when it has never been edited. */
  lastEditedById: string | null;
  lastEditedByName: string | null;
};

export type DocSnapshot = {
  id: string;
  docId: string;
  name: string;
  kind: SnapshotKind;
  /** Base64 of the full Yjs update at the time of the snapshot. */
  state: string;
  /** The same document as editor JSON. A restore applies this. */
  content: EditorJson;
  createdAt: string;
  createdById: string | null;
  createdByName: string | null;
};

export type ListDocsOptions = {
  archived: boolean;
  search?: string;
};

export type CreateSnapshotInput = {
  docId: string;
  name: string;
  kind: SnapshotKind;
  state: string;
  content: EditorJson;
};

export interface DocsRepo {
  listDocs(options: ListDocsOptions): Promise<DocSummary[]>;
  getDoc(id: string): Promise<DocSummary | null>;
  createDoc(title: string): Promise<DocSummary>;
  renameDoc(id: string, title: string): Promise<DocSummary>;
  setArchived(id: string, archived: boolean): Promise<DocSummary>;
  deleteDoc(id: string): Promise<void>;
  listSnapshots(docId: string): Promise<DocSnapshot[]>;
  getSnapshot(id: string): Promise<DocSnapshot | null>;
  createSnapshot(input: CreateSnapshotInput): Promise<DocSnapshot>;
  deleteSnapshot(id: string): Promise<void>;
}

/** Trim only: the title is the user's words, so no other rewriting happens here. */
export function cleanTitle(raw: string): string {
  const title = raw.trim();
  if (title.length === 0) throw new Error("A document needs a title.");
  if (title.length > TITLE_MAX) {
    throw new Error(`A document title can be at most ${TITLE_MAX} characters.`);
  }
  return title;
}

export function cleanSnapshotName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0) throw new Error("A version needs a name.");
  if (name.length > SNAPSHOT_NAME_MAX) {
    throw new Error(`A version name can be at most ${SNAPSHOT_NAME_MAX} characters.`);
  }
  return name;
}

/** Escape the LIKE wildcards so a search for "50%" means the characters, not a pattern. */
export function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function requireEditorJson(value: unknown, message: string): EditorJson {
  if (!isEditorJson(value)) throw new Error(message);
  return value;
}

async function currentUserId(client: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("You are not signed in.");
  return data.user.id;
}

async function memberNames(
  client: SupabaseClient<Database>,
  ids: ReadonlyArray<string>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await client
    .from("workspace_members")
    .select("user_id, display_name")
    .in("user_id", unique);
  if (error) throw new Error(`Could not read member names: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.user_id, row.display_name]));
}

/** The last writer of each document, read from the live state row the editor keeps. */
async function editors(
  client: SupabaseClient<Database>,
  docIds: ReadonlyArray<string>,
): Promise<Map<string, string>> {
  if (docIds.length === 0) return new Map();
  const { data, error } = await client
    .from("ws_doc_states")
    .select("doc_id, updated_by")
    .in("doc_id", [...docIds]);
  if (error) throw new Error(`Could not read who edited the documents: ${error.message}`);
  const result = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.updated_by) result.set(row.doc_id, row.updated_by);
  }
  return result;
}

type DocRow = Database["public"]["Tables"]["ws_docs"]["Row"];
type SnapshotRow = Database["public"]["Tables"]["ws_doc_snapshots"]["Row"];

function summaryFromRow(
  row: DocRow,
  editor: { id: string; name: string | null } | null,
): DocSummary {
  return {
    id: row.id,
    title: row.title,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastEditedById: editor?.id ?? null,
    lastEditedByName: editor?.name ?? null,
  };
}

function snapshotFromRow(row: SnapshotRow, createdByName: string | null): DocSnapshot {
  return {
    id: row.id,
    docId: row.doc_id,
    name: row.name,
    kind: row.kind,
    state: row.state,
    content: row.content,
    createdAt: row.created_at,
    createdById: row.created_by,
    createdByName,
  };
}

/** The Supabase implementation. Every query runs as the signed-in member; RLS is the guard. */
export function createSupabaseDocsRepo(client: SupabaseClient<Database>): DocsRepo {
  async function namesFor(ids: ReadonlyArray<string | null>): Promise<Map<string, string>> {
    return memberNames(
      client,
      ids.filter((id): id is string => id !== null),
    );
  }

  return {
    async listDocs(options) {
      let query = client
        .from("ws_docs")
        .select("*")
        .eq("archived", options.archived)
        .order("updated_at", { ascending: false });
      const search = options.search?.trim() ?? "";
      if (search) query = query.ilike("title", `%${escapeLike(search)}%`);

      const { data, error } = await query;
      if (error) throw new Error(`Could not read the document list: ${error.message}`);
      const rows = data ?? [];
      if (rows.length === 0) return [];

      const lastEditors = await editors(
        client,
        rows.map((row) => row.id),
      );
      const names = await namesFor([...lastEditors.values()]);
      return rows.map((row) => {
        const editorId = lastEditors.get(row.id) ?? null;
        return summaryFromRow(
          row,
          editorId ? { id: editorId, name: names.get(editorId) ?? null } : null,
        );
      });
    },

    async getDoc(id) {
      const { data, error } = await client.from("ws_docs").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`Could not read that document: ${error.message}`);
      if (!data) return null;

      const lastEditors = await editors(client, [data.id]);
      const editorId = lastEditors.get(data.id) ?? null;
      const names = await namesFor([editorId]);
      return summaryFromRow(
        data,
        editorId ? { id: editorId, name: names.get(editorId) ?? null } : null,
      );
    },

    async createDoc(title) {
      const clean = cleanTitle(title);
      const createdBy = await currentUserId(client);
      const { data, error } = await client
        .from("ws_docs")
        .insert({ title: clean, archived: false, created_by: createdBy })
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(`Could not create the document: ${error?.message ?? "no row returned"}`);
      }
      const names = await namesFor([createdBy]);
      return summaryFromRow(data, { id: createdBy, name: names.get(createdBy) ?? null });
    },

    async renameDoc(id, title) {
      const clean = cleanTitle(title);
      const { data, error } = await client
        .from("ws_docs")
        .update({ title: clean })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(`Could not rename the document: ${error.message}`);
      if (!data) throw new Error("That document was not found, or you cannot change it.");

      const lastEditors = await editors(client, [id]);
      const editorId = lastEditors.get(id) ?? null;
      const names = await namesFor([editorId]);
      return summaryFromRow(
        data,
        editorId ? { id: editorId, name: names.get(editorId) ?? null } : null,
      );
    },

    async setArchived(id, archived) {
      const { data, error } = await client
        .from("ws_docs")
        .update({ archived })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(`Could not update the document: ${error.message}`);
      if (!data) throw new Error("That document was not found, or you cannot change it.");

      const lastEditors = await editors(client, [id]);
      const editorId = lastEditors.get(id) ?? null;
      const names = await namesFor([editorId]);
      return summaryFromRow(
        data,
        editorId ? { id: editorId, name: names.get(editorId) ?? null } : null,
      );
    },

    async deleteDoc(id) {
      const { data, error } = await client.from("ws_docs").delete().eq("id", id).select("id");
      if (error) throw new Error(`Could not delete the document: ${error.message}`);
      if (!data || data.length === 0) {
        throw new Error("That document was not found, or you cannot delete it.");
      }
    },

    async listSnapshots(docId) {
      const { data, error } = await client
        .from("ws_doc_snapshots")
        .select("*")
        .eq("doc_id", docId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Could not read the version history: ${error.message}`);
      const rows = data ?? [];
      const names = await namesFor(rows.map((row) => row.created_by));
      return rows.map((row) =>
        snapshotFromRow(row, row.created_by ? (names.get(row.created_by) ?? null) : null),
      );
    },

    async getSnapshot(id) {
      const { data, error } = await client
        .from("ws_doc_snapshots")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`Could not read that version: ${error.message}`);
      if (!data) return null;
      const names = await namesFor([data.created_by]);
      return snapshotFromRow(data, data.created_by ? (names.get(data.created_by) ?? null) : null);
    },

    async createSnapshot(input) {
      const name = cleanSnapshotName(input.name);
      if (input.state.length === 0) throw new Error("A version needs the live document state.");
      const content = requireEditorJson(input.content, "A version needs the document content.");
      const createdBy = await currentUserId(client);
      const { data, error } = await client
        .from("ws_doc_snapshots")
        .insert({
          doc_id: input.docId,
          name,
          kind: input.kind,
          state: input.state,
          content,
          created_by: createdBy,
        })
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(`Could not save the version: ${error?.message ?? "no row returned"}`);
      }
      const names = await namesFor([createdBy]);
      return snapshotFromRow(data, names.get(createdBy) ?? null);
    },

    async deleteSnapshot(id) {
      const { data, error } = await client
        .from("ws_doc_snapshots")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw new Error(`Could not delete the version: ${error.message}`);
      if (!data || data.length === 0) {
        throw new Error("That version was not found, or you cannot delete it.");
      }
    },
  };
}

/* Demo implementation ------------------------------------------------------------------------- */

const DEMO_ME = { id: "demo-user", name: "Demo user" };
const DEMO_MARA = { id: "demo-mara", name: "Mara Santos" };
const DEMO_JUN = { id: "demo-jun", name: "Jun Reyes" };

const PORTAL_DOC_ID = "11111111-1111-4111-8111-111111111111";

type DemoDoc = DocSummary & { createdById: string | null };

type DemoState = {
  docs: DemoDoc[];
  snapshots: DocSnapshot[];
  nextId: number;
};

function demoPortalContent(): EditorJson {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "What this document covers" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Operations, cost and business notes for the workspace. This is demo content, so it is safe to change.",
          },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "What each tournament costs to run." }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Which work is quoted and which is recurring." }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function seedDemoState(): DemoState {
  const portal = demoPortalContent();
  return {
    nextId: 1,
    docs: [
      {
        id: PORTAL_DOC_ID,
        title: "Operations, cost and business portal",
        archived: false,
        createdAt: "2026-11-02T08:30:00.000Z",
        updatedAt: "2026-11-18T09:12:00.000Z",
        createdById: DEMO_MARA.id,
        lastEditedById: DEMO_MARA.id,
        lastEditedByName: DEMO_MARA.name,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        title: "24th Bamboo Tee, run sheet",
        archived: false,
        createdAt: "2026-11-10T07:05:00.000Z",
        updatedAt: "2026-11-17T15:40:00.000Z",
        createdById: DEMO_JUN.id,
        lastEditedById: DEMO_JUN.id,
        lastEditedByName: DEMO_JUN.name,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        title: "ZenLabs retainer notes",
        archived: true,
        createdAt: "2026-10-21T10:20:00.000Z",
        updatedAt: "2026-11-14T11:02:00.000Z",
        createdById: DEMO_MARA.id,
        lastEditedById: DEMO_MARA.id,
        lastEditedByName: DEMO_MARA.name,
      },
    ],
    snapshots: [
      {
        id: "demo-snapshot-portal",
        docId: PORTAL_DOC_ID,
        name: "Imported portal draft",
        kind: "manual",
        state: emptyDocState(),
        content: portal,
        createdAt: "2026-11-18T09:10:00.000Z",
        createdById: DEMO_MARA.id,
        createdByName: DEMO_MARA.name,
      },
    ],
  };
}

function copyDoc(doc: DemoDoc): DocSummary {
  const { createdById: _createdById, ...summary } = doc;
  return { ...summary };
}

function copySnapshot(snapshot: DocSnapshot): DocSnapshot {
  return { ...snapshot, content: structuredClone(snapshot.content) };
}

function buildDemoRepo(state: DemoState): DocsRepo {
  function findDoc(id: string): DemoDoc | null {
    return state.docs.find((doc) => doc.id === id) ?? null;
  }

  function touch(id: string): void {
    const doc = findDoc(id);
    if (!doc) return;
    doc.updatedAt = new Date().toISOString();
    doc.lastEditedById = DEMO_ME.id;
    doc.lastEditedByName = DEMO_ME.name;
  }

  return {
    async listDocs(options) {
      const search = options.search?.trim().toLowerCase() ?? "";
      return state.docs
        .filter((doc) => doc.archived === options.archived)
        .filter((doc) => (search ? doc.title.toLowerCase().includes(search) : true))
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(copyDoc);
    },

    async getDoc(id) {
      const doc = findDoc(id);
      return doc ? copyDoc(doc) : null;
    },

    async createDoc(title) {
      const clean = cleanTitle(title);
      const now = new Date().toISOString();
      const doc: DemoDoc = {
        id: crypto.randomUUID(),
        title: clean,
        archived: false,
        createdAt: now,
        updatedAt: now,
        createdById: DEMO_ME.id,
        lastEditedById: DEMO_ME.id,
        lastEditedByName: DEMO_ME.name,
      };
      state.docs.push(doc);
      return copyDoc(doc);
    },

    async renameDoc(id, title) {
      const clean = cleanTitle(title);
      const doc = findDoc(id);
      if (!doc) throw new Error("That document was not found.");
      doc.title = clean;
      touch(id);
      return copyDoc(doc);
    },

    async setArchived(id, archived) {
      const doc = findDoc(id);
      if (!doc) throw new Error("That document was not found.");
      doc.archived = archived;
      touch(id);
      return copyDoc(doc);
    },

    async deleteDoc(id) {
      const index = state.docs.findIndex((doc) => doc.id === id);
      if (index === -1) throw new Error("That document was not found.");
      state.docs.splice(index, 1);
      state.snapshots = state.snapshots.filter((snapshot) => snapshot.docId !== id);
    },

    async listSnapshots(docId) {
      return state.snapshots
        .filter((snapshot) => snapshot.docId === docId)
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(copySnapshot);
    },

    async getSnapshot(id) {
      const snapshot = state.snapshots.find((candidate) => candidate.id === id);
      return snapshot ? copySnapshot(snapshot) : null;
    },

    async createSnapshot(input) {
      const name = cleanSnapshotName(input.name);
      if (input.state.length === 0) throw new Error("A version needs the live document state.");
      const content = requireEditorJson(input.content, "A version needs the document content.");
      if (!findDoc(input.docId)) throw new Error("That document was not found.");
      const snapshot: DocSnapshot = {
        id: `demo-snapshot-${state.nextId++}`,
        docId: input.docId,
        name,
        kind: input.kind,
        state: input.state,
        content: structuredClone(content),
        createdAt: new Date().toISOString(),
        createdById: DEMO_ME.id,
        createdByName: DEMO_ME.name,
      };
      state.snapshots.push(snapshot);
      touch(input.docId);
      return copySnapshot(snapshot);
    },

    async deleteSnapshot(id) {
      const index = state.snapshots.findIndex((snapshot) => snapshot.id === id);
      if (index === -1) throw new Error("That version was not found.");
      state.snapshots.splice(index, 1);
    },
  };
}

let sharedDemoRepo: DocsRepo | null = null;

/**
 * Demo documents in memory. The app gets one shared instance per process so a document created in
 * the browser is still there on the next request; a test asks for `fresh` state instead.
 */
export function createDemoDocsRepo(fresh = false): DocsRepo {
  if (fresh) return buildDemoRepo(seedDemoState());
  sharedDemoRepo ??= buildDemoRepo(seedDemoState());
  return sharedDemoRepo;
}
