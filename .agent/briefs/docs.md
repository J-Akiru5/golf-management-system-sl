# Brief: DOCS (live collaborative documents)

Branch `ws/docs`, worktree `teeline-ws-docs`, from `feat/workspace` after FOUNDATION is merged.
Goal: the documents area of the workspace: a document list and a live, Google-Docs-style editor with
presence, autosave, version history and restore, plus a converter for the first document.

Read first: `docs/workspace/SPEC.md` (sections 4 to 9 especially), `supabase/migrations/20261120000200_workspace_docs.sql`
and `20261120000400_workspace_realtime.sql`, `apps/ops/src/lib/db/*`, the stub `apps/ops/src/lib/docs/repo.ts`,
`apps/ops/src/lib/repos.ts`, and the UI primitives in `apps/ops/src/components/ui`.

You own: `apps/ops/src/app/(app)/docs/**`, `apps/ops/src/components/docs/**`, `apps/ops/src/lib/docs/**`,
`apps/ops/scripts/portal-to-tiptap.mjs`, `apps/ops/seed/README.md`. Nothing else. All packages you need are
already installed (Tiptap 3.34.0 family, `yjs`, `y-protocols`, `@supabase-labs/y-supabase` 0.1.0).

## Build

### 1. Repository (`lib/docs/repo.ts`)
An interface `DocsRepo` with: `listDocs({ archived, search })`, `getDoc(id)`, `createDoc(title)`, `renameDoc`,
`setArchived`, `deleteDoc` (the UI only offers it when `can(viewer, "content.delete")`), `listSnapshots(docId)`,
`getSnapshot(id)`, `createSnapshot({ docId, name, kind, state, content })`, `deleteSnapshot`. A Supabase
implementation using the typed client (RLS does the access control; do not re-implement it), and an in-memory
demo implementation seeded with three believable documents (one titled like an ops and cost portal). Replace
the stubs the FOUNDATION wrote; keep their exported names. Tests for both.

### 2. Private channel wrapper (`lib/docs/private-client.ts`), see SPEC section 6
`withPrivateDocChannels(client)` returns a client whose `channel(name, opts)` opens `ws:doc:<name>` with
`config.private = true` merged over any options, and passes every other property through unchanged. This is a
few lines, not a provider. Unit test with a fake client: every `channel()` call is private and prefixed; other
methods pass through; options are preserved. Do NOT write your own Yjs provider.

### 3. Collaboration (`lib/docs/collab.ts` and `components/docs/*`)
- Create the Y.Doc and `SupabaseProvider` from `@supabase-labs/y-supabase` with the document id as the room name,
  the wrapped client, `awareness: true`, `maxReconnectAttempts: 10`, and persistence
  `{ table: "ws_doc_states", roomColumn: "doc_id", stateColumn: "state", storeTimeout: 2000 }`. Call
  `client.realtime.setAuth()` before connecting. Clean up on unmount (`destroy()`).
- Awareness user: `{ name: displayName, color }` where `color` comes from a pure `userColor(userId)` that is stable
  and picks from a palette that is legible on both light and dark (unit tested: deterministic, always from the
  palette, spread across ids).
- Editor: Tiptap with StarterKit (history disabled: Yjs handles undo), Collaboration (`document: ydoc`),
  CollaborationCaret (cursors with names and colours), Table (rows, header, cells), Placeholder. A toolbar for
  headings, bold, italic, lists, table insert, undo and redo. Mobile friendly.
- Status line: "Connected", "Saving...", "Saved", "Offline, changes kept" and "Cannot connect" after the provider
  gives up. Presence: avatars of people in the document (use the Avatar primitive), colours matching their cursors.
- Do not subscribe in demo mode (`demoMode()`): the editor works on a local Y.Doc with no provider and the status
  says "Demo, not shared".

### 4. Pages
- `/docs`: list of documents (title, last edited, by whom), a search box, an "Archived" toggle, "New document"
  (opens it), rename in place, archive and unarchive, delete for owner and partner only with a plain confirmation.
  Empty state when there are none. Skeleton while loading.
- `/docs/[id]`: the editor; title editable; "Save version" (asks for a name; writes a snapshot with the current Yjs
  state and the editor JSON); "History" in a side Sheet listing snapshots newest first with name, time and author
  and a read-only preview; "Restore" (members may restore): first writes a `pre_restore` snapshot of the current
  state, then applies the snapshot's `content` JSON to the live document as a new edit (so the history keeps both
  sides), and says so. A missing or inaccessible document gives the not-found page.
- A new document starts empty with the title the user typed.

### 5. Converter for the first document (`scripts/portal-to-tiptap.mjs`)
The first document is the owner's ops, cost and business portal, an HTML file at
`S:/Dev/golf-management-system-sl/ws-ref/teeline-ops-portal.html` (read it; do NOT copy it into the repo and do
NOT commit its content). Write a Node script: `node scripts/portal-to-tiptap.mjs <input.html> <outdir>` that
parses the HTML and writes, to `<outdir>`, the document as Tiptap JSON (`doc.json`) and a ready-to-run SQL
insert (`doc.sql`) for `ws_docs` (title). Convert headings, paragraphs, ordered and unordered lists, tables,
bold and italic; keep section order. Diagrams, images and scripted widgets are replaced with a short paragraph
saying what was omitted ("Diagram omitted: <alt text>"). Strip scripts and styles. The default output folder
`apps/ops/seed/out/` is git-ignored, and the real content stays out of the repository. Test it with a SMALL
synthetic HTML fixture you write yourself (headings, a list, a table, an image), not with the portal. In
`seed/README.md` explain how the owner runs it and loads the SQL.
Note: the SQL cannot create the Yjs state; the document opens with the converted content because the first editor
to open it seeds it from `doc.json` when no state row exists. Implement that seeding (idempotent: only when there is
no `ws_doc_states` row, and only one client seeds).

### 6. Tests
Pure logic unit tested (colours, wrapper, converter, repo, seeding decision, restore sequence as a pure function that
returns the steps to run). Component tests with jsdom where cheap.

## Acceptance
`pnpm --filter @teeline/ops typecheck`, `lint`, `test` pass (state counts). `OPS_DEMO=1` dev server: `/docs` lists
documents; `/docs/<id>` opens the editor, typing works, "Save version" and "Restore" work in demo; light and dark and
390px width are usable. One `next build` through the lock passes. Nothing outside your owned paths changed
(run `git diff --stat feat/workspace...HEAD` and check).
Be honest in the report: realtime and persistence cannot be verified without a real Supabase project; say what is
unit tested and what is not.
