import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20261123000300_entry_limits.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

const body = sql.slice(sql.indexOf("as $$"));

describe("the entry limits migration", () => {
  it("keeps every check and message the form already had", () => {
    for (const message of [
      "That tournament was not found.",
      "Registration for this event is not open.",
      "The entry deadline for this event has passed.",
      "A name is required.",
      "Please give a valid date of birth.",
      "A date of birth is required.",
      "Please choose a category (male or female).",
      "More than one member matches that name. Please add your NGAP number.",
      "That player is already registered for this event.",
      "One or more selected days are not valid. Choose the days again.",
      "Choose exactly %s playing day(s).",
      "Choose at most %s playing day(s).",
      "One of the selected days is not a playing day for this event.",
      "Thank you. The organizer will confirm your entry.",
    ]) {
      expect(sql).toContain(message);
    }
  });

  it("keeps the signature and the grants", () => {
    expect(sql).toContain("create or replace function public.submit_registration(");
    expect(sql).toContain(
      "revoke all on function public.submit_registration(uuid, jsonb, jsonb) from public;",
    );
    expect(sql).toContain(
      "grant execute on function public.submit_registration(uuid, jsonb, jsonb) to anon, authenticated;",
    );
  });

  it("answers the honeypot before it reads or writes anything", () => {
    expect(body).toContain("p_player ->> 'honeypot'");
    expect(body.indexOf("honeypot")).toBeLessThan(body.indexOf("from public.tournaments"));
  });

  it("bounds one connection's submissions and one event's new player rows", () => {
    expect(sql).toContain("r.rate_key = v_rate_key");
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toContain("v_recent >= 20");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("interval '1 hour'");
    expect(sql).toContain("v_new_players >= 25");
  });

  it("records the bucket on the row instead of adding a table", () => {
    expect(sql).toContain("add column if not exists rate_key text");
    expect(sql).toContain("create index if not exists registrations_rate_bucket_idx");
    expect(sql).not.toMatch(/create table/i);
  });
});
