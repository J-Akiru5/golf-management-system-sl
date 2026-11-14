import { describe, expect, it } from "vitest";
import {
  chooseBump,
  classifyChanges,
  nextVersion,
  promoteChangelog,
  shipApproved,
} from "./staging-release";

describe("classifyChanges", () => {
  it("treats docs and markdown only as docs-only", () => {
    const c = classifyChanges(["docs/PLAN.md", "CHANGELOG.md", "README.md"]);
    expect(c.docsOnly).toBe(true);
    expect(c.touchesUi).toBe(false);
  });
  it("sends migrations, vercel.json and workflows to the owner", () => {
    const c = classifyChanges([
      "supabase/migrations/2026_x.sql",
      "vercel.json",
      ".github/workflows/ci.yml",
      "src/a.ts",
    ]);
    expect(c.needsOwner).toHaveLength(3);
    expect(c.docsOnly).toBe(false);
    expect(c.touchesUi).toBe(true);
  });
  it("needs nothing for plain code", () => {
    expect(classifyChanges(["src/lib/a.ts"]).needsOwner).toEqual([]);
  });
  it("is not docs-only when there are no files", () => {
    expect(classifyChanges([]).docsOnly).toBe(false);
  });
});

describe("promoteChangelog", () => {
  const file = [
    "﻿# Changelog",
    "",
    "## [Unreleased]",
    "",
    "### Fixed",
    "- A fix.",
    "",
    "## [0.52.2] - 2026-11-14",
    "",
    "### Fixed",
    "- Old.",
  ].join("\r\n");

  it("moves the notes under the new version and keeps BOM and CRLF", () => {
    const out = promoteChangelog(file, "0.52.3", "2026-11-15");
    expect(out).not.toBeNull();
    const text = out?.text ?? "";
    expect(text.startsWith("﻿")).toBe(true);
    expect(text).toContain(
      "## [Unreleased]\r\n\r\n## [0.52.3] - 2026-11-15\r\n\r\n### Fixed\r\n- A fix.",
    );
    expect(text).toContain("## [0.52.2] - 2026-11-14");
    expect(out?.notes).toBe("### Fixed\r\n- A fix.");
  });
  it("returns null when Unreleased is empty", () => {
    const empty = [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "## [0.52.2] - 2026-11-14",
      "- x",
    ].join("\n");
    expect(promoteChangelog(empty, "0.52.3", "2026-11-15")).toBeNull();
  });
  it("returns null when there is no Unreleased heading", () => {
    expect(
      promoteChangelog("# Changelog\n\n## [0.1.0] - 2026-01-01\n- x", "0.1.1", "2026-01-02"),
    ).toBeNull();
  });
  it("handles Unreleased as the last section", () => {
    const out = promoteChangelog(
      "# C\n\n## [Unreleased]\n\n### Added\n- New.\n",
      "0.2.0",
      "2026-01-02",
    );
    expect(out?.text).toContain("## [0.2.0] - 2026-01-02");
  });
});

describe("version rules", () => {
  it("is minor when there is an Added section, patch otherwise", () => {
    expect(chooseBump("### Added\n- x")).toBe("minor");
    expect(chooseBump("### Fixed\n- x")).toBe("patch");
  });
  it("bumps", () => {
    expect(nextVersion("0.52.2", "patch")).toBe("0.52.3");
    expect(nextVersion("0.52.2", "minor")).toBe("0.53.0");
    expect(() => nextVersion("v1", "patch")).toThrow();
  });
});

describe("shipApproved", () => {
  const ev = (event: string, login: string) => ({
    event,
    label: { name: "ship" },
    actor: { login },
  });
  it("needs the owner to have labeled it", () => {
    expect(shipApproved([ev("labeled", "J-Akiru5")], "j-akiru5")).toBe(true);
    expect(shipApproved([ev("labeled", "someone-else")], "J-Akiru5")).toBe(false);
  });
  it("is cancelled by a later unlabel, and ignores other labels", () => {
    expect(shipApproved([ev("labeled", "J-Akiru5"), ev("unlabeled", "J-Akiru5")], "J-Akiru5")).toBe(
      false,
    );
    expect(
      shipApproved(
        [{ event: "labeled", label: { name: "bug" }, actor: { login: "J-Akiru5" } }],
        "J-Akiru5",
      ),
    ).toBe(false);
    expect(shipApproved([], "J-Akiru5")).toBe(false);
  });
});
