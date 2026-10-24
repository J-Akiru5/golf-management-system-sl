import { describe, expect, it } from "vitest";
import type { Tournament } from "@/lib/data/types";
import { confirmationEmail, reminderEmail } from "./templates";

const tournament = {
  name: "24th Bamboo Tee",
  hostName: "Tesla",
  dates: ["2026-11-12", "2026-11-13"],
  cutOffDate: "2026-11-01",
} as Tournament;

describe("email templates", () => {
  it("includes the event, host and dates in a confirmation", () => {
    const draft = confirmationEmail(tournament, "Maria Santos", "https://golf.example");
    expect(draft.subject).toContain("24th Bamboo Tee");
    expect(draft.body).toContain("Maria Santos");
    expect(draft.body).toContain("Host: Tesla");
    expect(draft.body).toContain("2026-11-12 to 2026-11-13");
    expect(draft.body).toContain("https://golf.example");
  });

  it("includes the cut-off in a reminder", () => {
    const draft = reminderEmail(tournament, "Maria Santos", "");
    expect(draft.subject).toContain("Reminder");
    expect(draft.body).toContain("Cut-off: 2026-11-01");
    expect(draft.body).not.toContain("Event page:");
  });
});
