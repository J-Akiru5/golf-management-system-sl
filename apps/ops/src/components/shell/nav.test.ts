import { describe, expect, it } from "vitest";
import { fullAccess, roleAccess } from "@/lib/access/pages";
import { isActive, navItemsFor, pageTitle } from "./nav";

const labels = (access: Parameters<typeof navItemsFor>[0]) =>
  navItemsFor(access).map((item) => item.label);

describe("navItemsFor", () => {
  it("gives the owner every place, with Admin last", () => {
    expect(labels(fullAccess())).toEqual([
      "Overview",
      "Documents",
      "Pipeline",
      "Tasks",
      "Timeline",
      "Settings",
      "Admin",
    ]);
  });

  it("hides a page at none and keeps it at view", () => {
    const partner = roleAccess("partner");
    expect(labels(partner)).toEqual([
      "Overview",
      "Documents",
      "Pipeline",
      "Tasks",
      "Timeline",
      "Settings",
    ]);

    const member = roleAccess("member");
    expect(labels(member)).not.toContain("Admin");
    expect(labels(member)).toContain("Pipeline");
  });

  it("hides everything a person with no access has", () => {
    expect(labels({})).toEqual([]);
  });

  it("opens Settings at the first tab the person may see", () => {
    const access = {
      ...roleAccess("member"),
      "settings.profile": "none" as const,
      "settings.members": "view" as const,
    };

    const settings = navItemsFor(access).find((item) => item.label === "Settings");
    expect(settings?.href).toBe("/settings/members");
  });

  it("drops the Settings entry when no Settings page is visible", () => {
    const access = {
      ...roleAccess("member"),
      "settings.profile": "none" as const,
      "settings.members": "none" as const,
      "settings.ai_providers": "none" as const,
    };

    expect(labels(access)).not.toContain("Settings");
  });
});

describe("isActive", () => {
  it("lights Overview only at the root", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/docs", "/")).toBe(false);
  });

  it("lights a section on its own page and its children", () => {
    expect(isActive("/docs", "/docs")).toBe(true);
    expect(isActive("/docs/abc", "/docs")).toBe(true);
    expect(isActive("/documents", "/docs")).toBe(false);
    expect(isActive("/boardx", "/board")).toBe(false);
  });
});

describe("pageTitle", () => {
  it("names the section", () => {
    expect(pageTitle("/")).toBe("Overview");
    expect(pageTitle("/docs/abc")).toBe("Documents");
    expect(pageTitle("/timeline")).toBe("Timeline");
    expect(pageTitle("/settings/members")).toBe("Settings");
    expect(pageTitle("/admin/audit")).toBe("Admin");
  });

  it("falls back for a path outside the menu", () => {
    expect(pageTitle("/login")).toBe("Workspace");
  });
});
