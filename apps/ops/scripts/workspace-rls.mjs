// RLS and realtime-policy check for the workspace migrations, run on an in-process Postgres (PGlite)
// with stand-ins for Supabase auth and realtime. Needs @electric-sql/pglite in apps/ops.
//   node scripts/workspace-rls.mjs ../../supabase/migrations
// Exits non-zero if any rule fails. Owned by the orchestrator; do not weaken a check to pass.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = process.argv[2];
const db = new PGlite();

const stubs = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table public.tournaments (id uuid primary key default gen_random_uuid(), name text);
create schema realtime;
create table realtime.messages (id bigserial primary key, topic text, extension text, payload jsonb, event text, private boolean default true);
create table realtime.broadcast_log (topic text, op text, tbl text);
create function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '') $$;
create function realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text default 'ROW')
  returns void language plpgsql as $$ begin insert into realtime.broadcast_log values (topic_name, operation, table_name); end $$;
alter table realtime.messages enable row level security;
grant usage on schema realtime to authenticated;
grant select, insert on realtime.messages to authenticated;
grant usage on all sequences in schema realtime to authenticated;
`;
await db.exec(stubs);

for (const f of readdirSync(MIGRATIONS).filter((n) => n.startsWith("202611200")).sort()) {
  await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  console.log("applied", f);
}

const U = {
  owner: "00000000-0000-0000-0000-00000000000a",
  member: "00000000-0000-0000-0000-00000000000b",
  partner: "00000000-0000-0000-0000-00000000000c",
  outsider: "00000000-0000-0000-0000-00000000000d",
  suspended: "00000000-0000-0000-0000-00000000000e",
  newbie: "00000000-0000-0000-0000-00000000000f",
};
for (const [k, id] of Object.entries(U)) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${k}@example.test`]);
}
await db.exec(`
  insert into public.workspace_members (user_id, role, status, display_name) values
   ('${U.owner}','owner','active','Olive Owner'),
   ('${U.member}','member','active','Mia Member'),
   ('${U.partner}','partner','active','Pat Partner'),
   ('${U.suspended}','member','suspended','Sam Suspended');
`);

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  <-- " + detail}`);
}

// Run SQL as a role + user. Returns { rows, error }.
async function as(who, sql, { role = "authenticated", topic = null } = {}) {
  const sub = who ? U[who] : "";
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub}', false); select set_config('realtime.topic', '${topic ?? ""}', false);`);
  try {
    const res = await db.query(sql);
    return { rows: res.rows, count: res.affectedRows ?? res.rows.length };
  } catch (e) {
    return { error: e.message, code: e.code };
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const sup = async (sql) => (await db.query(sql)).rows;

// ---- Outsider and anon get nothing ------------------------------------------------------------
await sup(`insert into public.ws_docs (id, title, created_by) values ('11111111-1111-1111-1111-111111111111','Seed doc','${U.owner}')`);
await sup(`insert into public.ws_doc_states (doc_id, state) values ('11111111-1111-1111-1111-111111111111','AAAA')`);
await sup(`insert into public.ws_pipeline_cards (title, club_name, created_by) values ('Seed card','IGCC','${U.owner}')`);
await sup(`insert into public.ws_tasks (title, created_by) values ('Seed task','${U.owner}')`);

for (const t of ["ws_docs", "ws_doc_states", "ws_doc_snapshots", "ws_pipeline_cards", "ws_tasks", "ws_task_comments", "workspace_members"]) {
  const r = await as("outsider", `select * from public.${t}`);
  check(`non-member reads nothing from ${t}`, !r.error && r.rows.length === 0, JSON.stringify(r));
  const s = await as("suspended", `select * from public.${t}`);
  const expected = t === "workspace_members" ? 1 : 0; // a suspended person sees only their own membership row
  check(`suspended member reads ${expected === 1 ? "only own row of" : "nothing from"} ${t}`, !s.error && s.rows.length === expected, JSON.stringify(s));
  const a = await as(null, `select * from public.${t}`, { role: "anon" });
  check(`anon is refused on ${t}`, !!a.error, "anon could read");
}
let r = await as("outsider", `insert into public.ws_docs (title, created_by) values ('x','${U.outsider}')`);
check("non-member cannot create a doc", !!r.error, JSON.stringify(r));
r = await as("outsider", `insert into public.ws_tasks (title, created_by) values ('x','${U.outsider}')`);
check("non-member cannot create a task", !!r.error);
r = await as("outsider", `select public.ws_is_member() as m`);
check("ws_is_member false for outsider", r.rows[0]?.m === false);
r = await as("suspended", `select public.ws_is_member() as m`);
check("ws_is_member false for suspended", r.rows[0]?.m === false);

// ---- Member capabilities and limits ----------------------------------------------------------
r = await as("member", `insert into public.ws_docs (id, title) values ('22222222-2222-2222-2222-222222222222','Member doc') returning created_by`);
check("member creates a doc, created_by defaults to them", r.rows?.[0]?.created_by === U.member, JSON.stringify(r));
r = await as("member", `insert into public.ws_docs (title, created_by) values ('spoof','${U.owner}')`);
check("member cannot create a doc as someone else", !!r.error);
r = await as("member", `update public.ws_docs set title = 'Renamed' where id = '22222222-2222-2222-2222-222222222222' returning title`);
check("member renames a doc", r.rows?.[0]?.title === "Renamed", JSON.stringify(r));
r = await as("member", `update public.ws_docs set archived = true where id = '11111111-1111-1111-1111-111111111111' returning archived`);
check("member archives a doc", r.rows?.[0]?.archived === true, JSON.stringify(r));
r = await as("member", `update public.ws_docs set created_by = '${U.member}' where id = '11111111-1111-1111-1111-111111111111'`);
check("member cannot re-attribute a doc", r.code === "42501", JSON.stringify(r));
r = await as("member", `delete from public.ws_docs where id = '22222222-2222-2222-2222-222222222222' returning id`);
check("member cannot delete a doc", !r.error && r.rows.length === 0, JSON.stringify(r));
check("doc still exists after the refused delete", (await sup(`select 1 from public.ws_docs where id='22222222-2222-2222-2222-222222222222'`)).length === 1);

r = await as("member", `insert into public.ws_doc_states (doc_id, state) values ('22222222-2222-2222-2222-222222222222','BBBB') on conflict (doc_id) do update set state = excluded.state returning state`);
check("member upserts doc state (y-supabase style)", r.rows?.[0]?.state === "BBBB", JSON.stringify(r));
r = await as("member", `insert into public.ws_doc_states (doc_id, state) values ('22222222-2222-2222-2222-222222222222','CCCC') on conflict (doc_id) do update set state = excluded.state returning state`);
check("member upserts doc state again (update path)", r.rows?.[0]?.state === "CCCC", JSON.stringify(r));
check("saving state bumped the doc's updated_at", (await sup(`select d.updated_at >= s.updated_at as ok from public.ws_docs d join public.ws_doc_states s on s.doc_id = d.id where d.id='22222222-2222-2222-2222-222222222222'`))[0].ok === true);

r = await as("member", `insert into public.ws_doc_snapshots (doc_id, name, state, content) values ('22222222-2222-2222-2222-222222222222','v1','CCCC','{"type":"doc"}') returning id`);
check("member saves a snapshot", !r.error && r.rows.length === 1, JSON.stringify(r));
r = await as("member", `update public.ws_doc_snapshots set name = 'hacked'`);
check("snapshots have no update path for members", !!r.error, JSON.stringify(r));
r = await as("member", `delete from public.ws_doc_snapshots returning id`);
check("member cannot delete a snapshot", !r.error && r.rows.length === 0, JSON.stringify(r));
r = await as("partner", `delete from public.ws_doc_snapshots returning id`);
check("partner deletes a snapshot", r.rows?.length === 1, JSON.stringify(r));
r = await as("partner", `delete from public.ws_docs where id = '22222222-2222-2222-2222-222222222222' returning id`);
check("partner deletes a doc", r.rows?.length === 1, JSON.stringify(r));
check("deleting a doc removes its state (cascade)", (await sup(`select 1 from public.ws_doc_states where doc_id='22222222-2222-2222-2222-222222222222'`)).length === 0);

// ---- Pipeline and tasks ----------------------------------------------------------------------
const T = (await sup(`insert into public.tournaments (name) values ('Dec 21 event') returning id`))[0].id;
r = await as("member", `insert into public.ws_pipeline_cards (title, club_name, tournament_id, stage, position, pricing_model, quoted_amount, owner_id) values ('Dec 21','IGCC','${T}','confirmed',1,'per_player',1500,'${U.member}') returning id, stage`);
check("member creates a pipeline card linked to a tournament", r.rows?.length === 1, JSON.stringify(r));
const card = r.rows?.[0]?.id;
r = await as("member", `update public.ws_pipeline_cards set stage = 'live', position = 0.5 where id = '${card}' returning stage`);
check("member moves a card", r.rows?.[0]?.stage === "live", JSON.stringify(r));
r = await as("member", `insert into public.ws_pipeline_cards (title, club_name, stage) values ('bad','x','nonsense')`);
check("an unknown stage is refused", !!r.error);
r = await as("member", `insert into public.ws_pipeline_cards (title, club_name, start_date, end_date) values ('bad dates','x','2026-12-22','2026-12-21')`);
check("end date before start date is refused", !!r.error);
r = await as("member", `delete from public.ws_pipeline_cards where id = '${card}' returning id`);
check("member cannot delete a card", !r.error && r.rows.length === 0, JSON.stringify(r));
r = await as("member", `insert into public.ws_tasks (title, assignee_id, pipeline_card_id, tournament_id, due_date, priority) values ('Call club','${U.partner}','${card}','${T}','2026-11-25','high') returning id`);
check("member creates a task assigned to a member, linked to card and tournament", r.rows?.length === 1, JSON.stringify(r));
const task = r.rows?.[0]?.id;
r = await as("member", `insert into public.ws_tasks (title, assignee_id) values ('x','${U.outsider}')`);
check("a task cannot be assigned to a non-member", !!r.error, JSON.stringify(r));
r = await as("member", `update public.ws_tasks set status = 'done' where id = '${task}' returning completed_at`);
check("done stamps completed_at", !!r.rows?.[0]?.completed_at, JSON.stringify(r));
r = await as("member", `update public.ws_tasks set status = 'todo' where id = '${task}' returning completed_at`);
check("reopening clears completed_at", r.rows?.[0]?.completed_at === null, JSON.stringify(r));
r = await as("member", `delete from public.ws_tasks where id = '${task}' returning id`);
check("member cannot delete a task", !r.error && r.rows.length === 0);

r = await as("member", `insert into public.ws_task_comments (task_id, body) values ('${task}','On it') returning id, author_id`);
const comment = r.rows?.[0]?.id;
check("member comments, author defaults to them", r.rows?.[0]?.author_id === U.member, JSON.stringify(r));
r = await as("member", `insert into public.ws_task_comments (task_id, body, author_id) values ('${task}','forged','${U.owner}')`);
check("a comment cannot be forged as someone else", !!r.error);
r = await as("owner", `update public.ws_task_comments set body = 'edited by owner' where id = '${comment}' returning id`);
check("even an owner cannot edit someone else's comment", !r.error && r.rows.length === 0, JSON.stringify(r));
r = await as("member", `update public.ws_task_comments set body = 'On it today', edited_at = now() where id = '${comment}' returning id`);
check("author edits own comment", r.rows?.length === 1, JSON.stringify(r));
r = await as("partner", `delete from public.ws_task_comments where id = '${comment}' returning id`);
check("partner deletes another member's comment", r.rows?.length === 1, JSON.stringify(r));
r = await as("partner", `delete from public.ws_tasks where id = '${task}' returning id`);
check("partner deletes a task", r.rows?.length === 1, JSON.stringify(r));
await sup(`delete from public.tournaments where id = '${T}'`);
check("deleting a tournament only clears the card's link", (await sup(`select tournament_id from public.ws_pipeline_cards where id='${card}'`))[0].tournament_id === null);

// ---- Members management ----------------------------------------------------------------------
r = await as("member", `update public.workspace_members set display_name = 'Mia M.' where user_id = '${U.member}' returning display_name`);
check("member edits own display name", r.rows?.[0]?.display_name === "Mia M.", JSON.stringify(r));
r = await as("member", `update public.workspace_members set role = 'owner' where user_id = '${U.member}'`);
check("member cannot promote themselves", r.code === "42501", JSON.stringify(r));
r = await as("member", `update public.workspace_members set status = 'active', invited_by = '${U.member}' where user_id = '${U.member}'`);
check("member cannot touch invited_by", r.code === "42501", JSON.stringify(r));
r = await as("member", `update public.workspace_members set display_name = 'hijack' where user_id = '${U.owner}' returning user_id`);
check("member cannot edit someone else's row", !r.error && r.rows.length === 0, JSON.stringify(r));
r = await as("partner", `update public.workspace_members set role = 'owner' where user_id = '${U.partner}'`);
check("partner cannot promote themselves", r.code === "42501", JSON.stringify(r));
r = await as("member", `select public.ws_add_member('newbie@example.test','member','New B')`);
check("member cannot add members", r.code === "42501", JSON.stringify(r));
r = await as("partner", `select * from public.ws_list_members()`);
check("partner cannot list member emails", r.code === "42501", JSON.stringify(r));
r = await as("member", `insert into public.workspace_members (user_id, role, display_name) values ('${U.newbie}','owner','self-invite')`);
check("no direct insert into workspace_members", !!r.error, JSON.stringify(r));
r = await as("owner", `select public.ws_add_member('NEWBIE@example.test ','member','New B') as id`);
check("owner adds a member by email (case and spaces ignored)", r.rows?.[0]?.id === U.newbie, JSON.stringify(r));
r = await as("owner", `select public.ws_add_member('ghost@example.test','member','Ghost')`);
check("adding an unknown email is refused", r.code === "P0002", JSON.stringify(r));
r = await as("owner", `select email, role from public.ws_list_members() order by email`);
check("owner lists members with emails", r.rows?.length === 5, JSON.stringify(r));
r = await as("owner", `update public.workspace_members set status = 'suspended' where user_id = '${U.newbie}' returning status`);
check("owner suspends a member", r.rows?.[0]?.status === "suspended", JSON.stringify(r));
r = await as("owner", `update public.workspace_members set role = 'member' where user_id = '${U.owner}'`);
check("the last owner cannot demote themselves", r.code === "23514", JSON.stringify(r));
r = await as("owner", `delete from public.workspace_members where user_id = '${U.owner}'`);
check("the last owner cannot be removed", r.code === "23514", JSON.stringify(r));
r = await as("owner", `update public.workspace_members set role = 'owner' where user_id = '${U.partner}' returning role`);
check("owner promotes a partner", r.rows?.[0]?.role === "owner", JSON.stringify(r));
r = await as("owner", `update public.workspace_members set role = 'member' where user_id = '${U.owner}' returning role`);
check("with a second owner, the first can step down", r.rows?.[0]?.role === "member", JSON.stringify(r));
await sup(`update public.workspace_members set role='owner' where user_id='${U.owner}'`);
await sup(`update public.workspace_members set role='partner' where user_id='${U.partner}'`);

// ---- Realtime policies -----------------------------------------------------------------------
await sup(`insert into realtime.messages (topic, extension, payload, event) values ('x','broadcast','{}','e'),('y','broadcast','{}','e')`);
const DOC = "11111111-1111-1111-1111-111111111111";
async function canRead(who, topic, ext = "broadcast") {
  await sup(`update realtime.messages set extension = '${ext}'`);
  const x = await as(who, `select count(*)::int as n from realtime.messages`, { topic });
  return !x.error && x.rows[0].n > 0;
}
check("member receives ws:board", await canRead("member", "ws:board"));
check("member receives ws:tasks", await canRead("member", "ws:tasks"));
check("member receives a real doc channel", await canRead("member", `ws:doc:${DOC}`));
check("member does NOT receive a doc channel that does not exist", !(await canRead("member", "ws:doc:99999999-9999-9999-9999-999999999999")));
check("member does NOT receive an unrelated topic", !(await canRead("member", "ws:secret")));
check("outsider does NOT receive ws:board", !(await canRead("outsider", "ws:board")));
check("outsider does NOT receive a real doc channel", !(await canRead("outsider", `ws:doc:${DOC}`)));
check("suspended member does NOT receive ws:tasks", !(await canRead("suspended", "ws:tasks")));
check("anon does NOT receive ws:board", !((await as(null, `select count(*)::int n from realtime.messages`, { role: "anon", topic: "ws:board" })).rows?.[0]?.n > 0));
check("a non-broadcast extension is refused", !(await canRead("member", "ws:board", "postgres_changes")));
r = await as("member", `insert into realtime.messages (topic, extension, payload, event) values ('ws:doc:${DOC}','broadcast','{}','e')`, { topic: `ws:doc:${DOC}` });
check("member may send on a real doc channel", !r.error, JSON.stringify(r));
r = await as("member", `insert into realtime.messages (topic, extension, payload, event) values ('ws:board','broadcast','{}','forged')`, { topic: "ws:board" });
check("member may NOT send on ws:board (no forged change events)", !!r.error, JSON.stringify(r));
r = await as("member", `insert into realtime.messages (topic, extension, payload, event) values ('ws:doc:99999999-9999-9999-9999-999999999999','broadcast','{}','e')`, { topic: "ws:doc:99999999-9999-9999-9999-999999999999" });
check("member may NOT send on a doc channel that does not exist", !!r.error, JSON.stringify(r));
r = await as("outsider", `insert into realtime.messages (topic, extension, payload, event) values ('ws:doc:${DOC}','broadcast','{}','e')`, { topic: `ws:doc:${DOC}` });
check("outsider may NOT send on a real doc channel", !!r.error, JSON.stringify(r));

await sup(`delete from realtime.broadcast_log`);
await as("member", `insert into public.ws_pipeline_cards (title, club_name) values ('bc','x')`);
await as("member", `insert into public.ws_tasks (title) values ('bc')`);
const logTopics = (await sup(`select distinct topic from realtime.broadcast_log order by 1`)).map((x) => x.topic);
check("board and task writes emit change events on the right channels", logTopics.join() === "ws:board,ws:tasks", logTopics.join());

// ---- Function exposure ----------------------------------------------------------------------
r = await as(null, `select public.ws_is_member()`, { role: "anon" });
check("anon cannot execute ws_is_member", !!r.error, JSON.stringify(r));
r = await as(null, `select public.ws_add_member('a@b.c','member','x')`, { role: "anon" });
check("anon cannot execute ws_add_member", !!r.error);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
