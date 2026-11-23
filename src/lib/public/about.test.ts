import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PARTNERS, SPONSORS } from "./about";

describe("the public footer credits", () => {
  it("keeps the three delivery partners in order", () => {
    expect(PARTNERS.map((partner) => partner.name)).toEqual([
      "Syntaxure Labs",
      "MDM Events",
      "ZenLabs",
    ]);
  });

  it("credits Converge as the internet sponsor", () => {
    const converge = SPONSORS.find((sponsor) => sponsor.name === "Converge");
    expect(converge?.role).toBe("Internet partner");
    expect(converge?.href).toBe("https://www.convergeict.com/");
    expect(converge?.logo.src).toBe("/partners/converge-logo.svg");
  });

  it("bundles every footer logo, and keeps the sponsor mark wide", () => {
    for (const entry of [...SPONSORS, ...PARTNERS]) {
      expect(entry.logo.src.startsWith("/"), entry.name).toBe(true);
      expect(existsSync(join(process.cwd(), "public", entry.logo.src)), entry.name).toBe(true);
    }
    const converge = SPONSORS[0];
    expect(converge).toBeDefined();
    if (!converge) return;
    const ratio = converge.logo.width / converge.logo.height;
    expect(ratio).toBeGreaterThan(4);
    expect(ratio).toBeLessThan(4.3);
  });
});
