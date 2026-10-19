import { describe, expect, it } from "vitest";
import { type DeskAccessProblem, accessProblemCopy } from "./access-problem";

const problems: DeskAccessProblem[] = ["no-club", "multi-club", "bad-role"];

describe("accessProblemCopy", () => {
  it("gives each problem its own title, so the screen cannot be ambiguous", () => {
    const titles = problems.map((p) => accessProblemCopy(p).title);
    expect(new Set(titles).size).toBe(problems.length);
  });

  it("does not blame the connection, because the connection is fine", () => {
    for (const problem of problems) {
      expect(accessProblemCopy(problem).body).not.toMatch(/connection|network|offline/i);
    }
  });

  it("never offers a retry, because none of these fix themselves", () => {
    for (const problem of problems) {
      const copy = accessProblemCopy(problem);
      const whole = `${copy.title} ${copy.body} ${copy.next}`;
      expect(whole).not.toMatch(/\bretry\b|\btry again\b|\breload\b/i);
    }
  });

  it("points an account with no club at the club, not at itself", () => {
    const copy = accessProblemCopy("no-club");
    expect(copy.body).toMatch(/membership/i);
    expect(copy.next).toMatch(/club/i);
  });

  it("names the roles that are valid when the stored role is not", () => {
    const copy = accessProblemCopy("bad-role");
    expect(copy.next).toMatch(/owner/);
    expect(copy.next).toMatch(/organizer/);
    expect(copy.next).toMatch(/desk/);
  });
});
