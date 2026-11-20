import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20261115000800_membership_follows_registration.sql"),
  "utf8",
);

describe("20261115000800_membership_follows_registration", () => {
  it("keeps the owner/organizer check", () => {
    expect(sql).toContain("array['owner', 'organizer']");
  });

  it("writes the new role to the registration in both places", () => {
    expect(sql).toContain("set membership_type = p_type");
    expect(sql).toContain("'{role}'");
  });

  it("moves the pair seat, or unpairs when the side is taken", () => {
    expect(sql).toContain("set side = p_type");
    expect(sql).toContain("delete from public.registration_pair_members");
  });

  it("leaves final events alone", () => {
    expect(sql).toContain("r.status <> 'final'");
  });
});
