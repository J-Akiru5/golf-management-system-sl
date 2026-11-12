import { describe, expect, it } from "vitest";
import { foldAccents, formatName, matchesText, parseName, searchKey, tidyName } from "./index";

describe("tidyName", () => {
  it("fixes the spacing around the comma and uppercases", () => {
    expect(tidyName("BRAGA,NONOY")).toBe("BRAGA, NONOY");
    expect(tidyName("  Lim ,  Apoy ")).toBe("LIM, APOY");
  });
  it("collapses runs of spaces and drops a trailing comma", () => {
    expect(tidyName("SEGOVIA,   FERNANDO   SIXTO,")).toBe("SEGOVIA, FERNANDO SIXTO");
  });
  it("keeps Ñ and does not reorder words", () => {
    expect(tidyName("tañada, jose leonardo")).toBe("TAÑADA, JOSE LEONARDO");
    expect(tidyName("Eun Jin Seo")).toBe("EUN JIN SEO");
  });
});

describe("parseName", () => {
  it("reads surname before the comma", () => {
    expect(parseName("ADORIO, RONNEL")).toEqual({
      surname: "ADORIO",
      given: "RONNEL",
      certain: true,
    });
    expect(parseName("DE LA CRUZ, MARIA CLARA").surname).toBe("DE LA CRUZ");
  });
  it("falls back to the last word when there is no comma, and says it is a guess", () => {
    expect(parseName("Maria Clara Santos")).toEqual({
      surname: "Santos",
      given: "Maria Clara",
      certain: false,
    });
  });
  it("handles a single word", () => {
    expect(parseName("Pele")).toEqual({ surname: "Pele", given: "", certain: false });
  });
});

describe("formatName", () => {
  it("writes SURNAME, GIVEN", () => {
    expect(formatName("Ronnel", "Adorio")).toBe("ADORIO, RONNEL");
    expect(formatName(" Jose  Leonardo ", "Tañada")).toBe("TAÑADA, JOSE LEONARDO");
  });
  it("never invents a missing half", () => {
    expect(formatName("", "Adorio")).toBe("ADORIO");
    expect(formatName("Ronnel", "")).toBe("RONNEL");
  });
});

describe("searchKey and matchesText", () => {
  it("folds accents, case and punctuation", () => {
    expect(foldAccents("TAÑADA")).toBe("TANADA");
    expect(searchKey("TAÑADA, JOSE LEONARDO")).toBe("tanada jose leonardo");
    expect(searchKey("ALAS-AS, FRED")).toBe("alas as fred");
  });
  it("finds a player however the query is typed", () => {
    const name = "ADORIO, RONNEL";
    expect(matchesText(name, "ronnel adorio")).toBe(true);
    expect(matchesText(name, "adorio,ronnel")).toBe(true);
    expect(matchesText(name, "ADO")).toBe(true);
    expect(matchesText(name, "adorio r")).toBe(true);
    expect(matchesText("TAÑADA, JOSE", "tanada")).toBe(true);
    expect(matchesText("BUÑI, GERRY", "buni")).toBe(true);
    expect(matchesText("BUÑI, GERRY", "buñi")).toBe(true);
  });
  it("does not match a word that is not there", () => {
    expect(matchesText("ADORIO, RONNEL", "ronnel smith")).toBe(false);
  });
  it("matches an empty query and searches several fields", () => {
    expect(matchesText("ANYONE", "   ")).toBe(true);
    expect(matchesText(["ADORIO, RONNEL", "1006507", null], "1006507")).toBe(true);
    expect(matchesText(["ADORIO, RONNEL", "1006507", null], "nope")).toBe(false);
  });
  it("does not combine words across different fields", () => {
    expect(matchesText(["ADORIO", "RONNEL"], "adorio ronnel")).toBe(false);
  });
});
