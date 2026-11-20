# Importing the first document

The workspace starts with one real document: the owner's operations, cost and business portal.
The page itself is an HTML file outside this repository. This folder holds the converter's output,
which is git-ignored on purpose. Nothing here is committed.

## What the converter does

`scripts/portal-to-tiptap.mjs` reads the HTML page and writes two files:

- `doc.json`: the document as Tiptap JSON.
- `doc.sql`: one `insert` for `public.ws_docs`, with the page title and a document id.

It keeps headings, paragraphs, bullet and numbered lists, tables, bold and italic, in the order
they appear. Scripts and styles are removed. Diagrams, images and scripted widgets are replaced with
a short paragraph that says what was left out, for example
`Diagram omitted: Tournament setup flow.` Decorative elements the source marks with
`aria-hidden="true"` are skipped, because they carry no meaning.

The SQL cannot create the live document state: that is Yjs data, not something SQL can write. So
the SQL creates the row, and the first editor that opens the document imports `doc.json` once.

## Run it

From `apps/ops`:

```bash
node scripts/portal-to-tiptap.mjs <path-to-the-html> seed/out
```

`seed/out` is the default, and it is in `.gitignore`. The script prints the document id it put in the
SQL. The title is taken from the page's `<title>`, then its first `<h1>`, then the file name.

## Load the SQL

Run `doc.sql` in the Supabase SQL editor for the workspace project. Paste the whole file and run it
once. It inserts with a fixed id and `on conflict (id) do nothing`, so running it twice is safe.

Run it as the project owner. `created_by` stays empty for a row created this way, which the schema
allows.

## Let the first editor import the content

The app needs to know which document `doc.json` belongs to. Set both values where the app runs,
for example in `apps/ops/.env.local` and in the Vercel project's environment variables:

```
OPS_DOC_SEED_ID=<the id printed by the script>
OPS_DOC_SEED_FILE=<absolute path to doc.json>   # optional
```

`OPS_DOC_SEED_FILE` defaults to `seed/out/doc.json` relative to the app's working directory. On a
hosted deployment there is no such file, so set the path to a file you place there yourself, or skip
the import and paste the content in.

The import happens only when all of these hold:

1. The document id equals `OPS_DOC_SEED_ID`.
2. There is no row in `ws_doc_states` for the document.
3. The live document is still empty.
4. This editor wins the claim: it inserts the first state row, and the database's primary key lets
   exactly one client through. Every other client reads what that one writes.

So a second open never duplicates the content, and an edited document is never overwritten.

## Keep the content out of the repository

Do not commit the source HTML, `doc.json` or `doc.sql`. They contain the owner's business figures.
The seed folder is ignored for that reason; leave the ignore rule alone.

## Limits, stated plainly

- The converter handles the tags the portal uses. A page built from a different template may need
  another rule; check `doc.json` before you load it.
- Tables keep their cell text, not any styling or merged cells.
- Comments and footnotes are not kept.
- The import is a one-time convenience for the first document. It is not a general import tool.
