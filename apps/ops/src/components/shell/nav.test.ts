import { describe, expect, it } from "vitest";
import { isActive, NAV_ITEMS, navItemsFor, pageTitle } from "./nav";

describe("NAV_ITEMS", () => {
  it("has the five places in order with unique paths", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Overview",
      "Documents",
      "Pipeline",
      "Tasks",
      "Settings",
    ]);
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/",
      "/docs",
      "/board",
      "/tasks",
      "/settings",
    ]);
  });
});

describe("navItemsFor", () => {
  it("adds Admin for an owner only, last", () => {
    expect(navItemsFor(true).map((item) => item.label)).toEqual([
      "Overview",
      "Documents",
      "Pipeline",
      "Tasks",
      "Settings",
      "Admin",
    ]);
    expect(navItemsFor(false).map((item) => item.label)).toEqual([
      "Overview",
      "Documents",
      "Pipeline",
      "Tasks",
      "Settings",
    ]);
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
    expect(pageTitle("/settings/members")).toBe("Settings");
    expect(pageTitle("/admin/audit")).toBe("Admin");
  });

  it("falls back for a path outside the menu", () => {
    expect(pageTitle("/login")).toBe("Workspace");
  });
});
