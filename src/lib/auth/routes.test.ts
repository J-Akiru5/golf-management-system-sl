import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { areaOf, decide, landingFor, PROXY_MATCHER } from "./routes";

describe("areaOf", () => {
  it("puts the marketing page, pairings and the entry form in the public area", () => {
    expect(areaOf("/")).toBe("public");
    expect(areaOf("/pairings")).toBe("public");
    expect(areaOf("/enter/abc")).toBe("public");
    expect(areaOf("/login")).toBe("public");
  });

  it("claims /my and nothing that merely starts with the same letters", () => {
    expect(areaOf("/my")).toBe("player");
    expect(areaOf("/my/pairings")).toBe("player");
    expect(areaOf("/mystery")).toBe("public");
  });

  it("covers every desk screen, including the control room at /admin", () => {
    for (const path of [
      "/admin",
      "/admin/anything",
      "/players",
      "/players/p1",
      "/draw",
      "/print",
      "/setup",
      "/register",
      "/import",
      "/tournaments",
      "/course",
      "/spotlight",
    ]) {
      expect(areaOf(path)).toBe("staff");
    }
  });
});

describe("decide", () => {
  it("lets anyone read the public pages", () => {
    for (const identity of ["signed-out", "staff", "player", "unlinked"] as const) {
      expect(decide({ pathname: "/", identity })).toEqual({ type: "allow" });
      expect(decide({ pathname: "/pairings", identity })).toEqual({ type: "allow" });
      expect(decide({ pathname: "/enter/e1", identity })).toEqual({ type: "allow" });
    }
  });

  it("sends a signed-out visitor to sign in, remembering where they were going", () => {
    const decision = decide({ pathname: "/admin", search: "?tab=draw", identity: "signed-out" });
    expect(decision).toEqual({
      type: "redirect",
      to: "/login?next=%2Fadmin%3Ftab%3Ddraw&error=sign_in_required",
    });
  });

  it("keeps players out of the desk and unlinked accounts out of both", () => {
    expect(decide({ pathname: "/players", identity: "player" })).toEqual({
      type: "redirect",
      to: "/my",
    });
    expect(decide({ pathname: "/admin", identity: "unlinked" })).toEqual({
      type: "redirect",
      to: "/my",
    });
  });

  it("lets staff and players into their own areas, and staff into the player area", () => {
    expect(decide({ pathname: "/admin", identity: "staff" })).toEqual({ type: "allow" });
    expect(decide({ pathname: "/my", identity: "player" })).toEqual({ type: "allow" });
    expect(decide({ pathname: "/my", identity: "unlinked" })).toEqual({ type: "allow" });
    expect(decide({ pathname: "/my", identity: "staff" })).toEqual({ type: "allow" });
  });

  it("shows the sign-in page to visitors and moves signed-in accounts on", () => {
    expect(decide({ pathname: "/login", identity: "signed-out" })).toEqual({ type: "allow" });
    expect(decide({ pathname: "/login", identity: "staff" })).toEqual({
      type: "redirect",
      to: "/admin",
    });
    expect(decide({ pathname: "/login", identity: "player" })).toEqual({
      type: "redirect",
      to: "/my",
    });
    expect(decide({ pathname: "/login", identity: "unlinked" })).toEqual({
      type: "redirect",
      to: "/my",
    });
  });

  it("respects where a sign-in link was aiming, within the account's area", () => {
    expect(decide({ pathname: "/login", next: "/draw", identity: "staff" })).toEqual({
      type: "redirect",
      to: "/draw",
    });
    expect(decide({ pathname: "/login", next: "/draw", identity: "player" })).toEqual({
      type: "redirect",
      to: "/my",
    });
  });
});

describe("landingFor", () => {
  it("honours a next path the account may actually open", () => {
    expect(landingFor({ next: "/draw?group=3", identity: "staff" })).toBe("/draw?group=3");
    expect(landingFor({ next: "/pairings", identity: "player" })).toBe("/pairings");
  });

  it("refuses a next path from the other area, and refuses anything off-site", () => {
    expect(landingFor({ next: "/players", identity: "player" })).toBe("/my");
    expect(landingFor({ next: "//evil.example", identity: "staff" })).toBe("/admin");
    expect(landingFor({ next: "https://evil.example", identity: "staff" })).toBe("/admin");
    expect(landingFor({ next: "/\\evil", identity: "staff" })).toBe("/admin");
  });

  it("has a home for every account", () => {
    expect(landingFor({ identity: "staff" })).toBe("/admin");
    expect(landingFor({ identity: "player" })).toBe("/my");
    expect(landingFor({ identity: "unlinked" })).toBe("/my");
  });
});

describe("PROXY_MATCHER", () => {
  it("covers both guarded areas, sign-in and the auth handler", () => {
    expect(PROXY_MATCHER).toContain("/auth/:path*");
    for (const prefix of ["/admin", "/players", "/draw", "/my"]) {
      expect(PROXY_MATCHER).toContain(`${prefix}/:path*`);
    }
  });

  it("does not make the public pages pay for a session lookup", () => {
    for (const path of ["/", "/pairings", "/enter", "/print-preview"]) {
      expect(PROXY_MATCHER).not.toContain(path);
      expect(PROXY_MATCHER).not.toContain(`${path}/:path*`);
    }
  });

  // Next.js parses the proxy's config statically, so the matcher is a literal there. This keeps the
  // two lists from drifting apart silently.
  it("is exactly the list the proxy uses", () => {
    const source = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    const block = source.slice(source.indexOf("matcher: ["));
    const end = block.indexOf("]");
    const literal = [...block.slice(0, end).matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(literal).toEqual(PROXY_MATCHER);
  });
});
