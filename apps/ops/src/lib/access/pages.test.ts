import { describe, expect, it } from "vitest";
import {
  effectiveAccess,
  firstSettingsPage,
  levelAtLeast,
  mergeWithDefaults,
  navItemsFor,
  overridesByPage,
  PAGE_IDS,
  pageForPath,
  ROLE_DEFAULTS,
  roleAccess,
  settingsTabsFor,
  strongestLevel,
  WORKSPACE_ROLES,
  workspacePages,
} from "./pages";

describe("the registry", () => {
  it("has the eight pages, each with a role default for every role", () => {
    expect(PAGE_IDS).toEqual([
      "overview",
      "documents",
      "pipeline",
      "tasks",
      "settings.profile",
      "settings.members",
      "settings.ai_providers",
      "admin",
    ]);

    for (const page of PAGE_IDS) {
      for (const role of WORKSPACE_ROLES) {
        expect(["none", "view", "edit"]).toContain(ROLE_DEFAULTS[role][page]);
      }
    }
  });

  it("uses routes that do not collide, with the longest prefix winning", () => {
    expect(pageForPath("/")).toBe("overview");
    expect(pageForPath("/docs")).toBe("documents");
    expect(pageForPath("/docs/abc")).toBe("documents");
    expect(pageForPath("/board")).toBe("pipeline");
    expect(pageForPath("/tasks")).toBe("tasks");
    expect(pageForPath("/settings")).toBe("settings.profile");
    expect(pageForPath("/settings/members")).toBe("settings.members");
    expect(pageForPath("/settings/members/anything")).toBe("settings.members");
    expect(pageForPath("/settings/ai-providers")).toBe("settings.ai_providers");
    expect(pageForPath("/admin/audit")).toBe("admin");
    expect(pageForPath("/login")).toBeNull();
    expect(pageForPath("/documents")).toBeNull();
  });

  it("marks Settings as one menu entry with its own label", () => {
    const pages = workspacePages();
    expect(pages.map((page) => page.id)).toEqual(PAGE_IDS);
    expect(
      pages
        .filter((page) => page.nav)
        .map((page) => ("navLabel" in page ? page.navLabel : page.label)),
    ).toEqual(["Overview", "Documents", "Pipeline", "Tasks", "Settings", "Admin"]);
  });
});

describe("effectiveAccess", () => {
  it("gives the owner edit everywhere and cannot be lowered", () => {
    for (const page of PAGE_IDS) {
      expect(effectiveAccess("owner", {}, page)).toBe("edit");
      expect(effectiveAccess("owner", { [page]: "none" }, page)).toBe("edit");
    }
  });

  it("uses the role default when there is no override", () => {
    expect(effectiveAccess("partner", {}, "documents")).toBe("edit");
    expect(effectiveAccess("partner", {}, "settings.members")).toBe("view");
    expect(effectiveAccess("partner", {}, "settings.ai_providers")).toBe("none");
    expect(effectiveAccess("partner", {}, "admin")).toBe("none");
    expect(effectiveAccess("member", {}, "pipeline")).toBe("view");
    expect(effectiveAccess("member", {}, "documents")).toBe("edit");
    expect(effectiveAccess("member", {}, "settings.members")).toBe("none");
  });

  it("lets an override win over the role, up or down", () => {
    expect(effectiveAccess("member", { pipeline: "edit" }, "pipeline")).toBe("edit");
    expect(effectiveAccess("partner", { documents: "none" }, "documents")).toBe("none");
    expect(effectiveAccess("partner", { documents: "none" }, "tasks")).toBe("edit");
  });

  it("gives a person with no role nothing", () => {
    expect(effectiveAccess(null, {}, "overview")).toBe("none");
    expect(effectiveAccess(null, { overview: "edit" }, "overview")).toBe("none");
  });
});

describe("levels", () => {
  it("orders none below view below edit", () => {
    expect(levelAtLeast("edit", "edit")).toBe(true);
    expect(levelAtLeast("edit", "view")).toBe(true);
    expect(levelAtLeast("view", "edit")).toBe(false);
    expect(levelAtLeast("none", "view")).toBe(false);
    expect(strongestLevel("none", "view")).toBe("view");
    expect(strongestLevel("edit", "view")).toBe("edit");
  });
});

describe("roleAccess and mergeWithDefaults", () => {
  it("gives every page the role default", () => {
    expect(roleAccess("member")).toMatchObject({
      overview: "edit",
      pipeline: "view",
      admin: "none",
    });
    expect(Object.keys(roleAccess("member"))).toHaveLength(PAGE_IDS.length);
  });

  it("applies stored rows and keeps the default for a page the database did not mention", () => {
    const merged = mergeWithDefaults("member", [
      { page: "documents", level: "none" },
      { page: "pipeline", level: "edit" },
      { page: "not-a-page", level: "edit" },
      { page: "tasks", level: "sideways" as never },
    ]);

    expect(merged.documents).toBe("none");
    expect(merged.pipeline).toBe("edit");
    expect(merged.tasks).toBe("edit");
    expect(merged.admin).toBe("none");
  });

  it("turns override rows into the map the function takes", () => {
    expect(
      overridesByPage([
        { page: "documents", level: "view" },
        { page: "unknown", level: "edit" },
      ]),
    ).toEqual({ documents: "view" });
  });
});

describe("the menu", () => {
  it("shows an item at view and hides it at none", () => {
    const partner = roleAccess("partner");
    expect(navItemsFor(partner).map((item) => item.label)).toEqual([
      "Overview",
      "Documents",
      "Pipeline",
      "Tasks",
      "Settings",
    ]);

    expect(navItemsFor({ ...partner, pipeline: "none" }).map((item) => item.label)).not.toContain(
      "Pipeline",
    );
  });

  it("opens Settings at the first visible tab", () => {
    const access = {
      ...roleAccess("member"),
      "settings.profile": "none" as const,
      "settings.members": "view" as const,
    };

    expect(firstSettingsPage(access)?.route).toBe("/settings/members");
    expect(navItemsFor(access).find((item) => item.label === "Settings")?.href).toBe(
      "/settings/members",
    );
    expect(settingsTabsFor(access).map((tab) => tab.label)).toEqual(["Members"]);
  });

  it("shows both visible Settings tabs for the owner", () => {
    expect(settingsTabsFor(roleAccess("owner")).map((tab) => tab.label)).toEqual([
      "Profile",
      "Members",
      "AI providers",
    ]);
  });
});
