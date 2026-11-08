import { describe, expect, it } from "vitest";
import type { PortalEntry } from "./portal";
import {
  hasContactChanges,
  indexFromEntries,
  mapOwnProfile,
  normalizeContact,
  validateContact,
} from "./profile";

const contact = (over: Partial<{ phone: string; email: string; nickname: string }> = {}) => ({
  phone: "",
  email: "",
  nickname: "",
  ...over,
});

describe("normalizeContact", () => {
  it("trims the ends and keeps the number as the player wrote it", () => {
    expect(normalizeContact(contact({ phone: "  0917 123 4567 " })).phone).toBe("0917 123 4567");
  });

  it("turns control characters into single spaces and trims the nickname", () => {
    expect(normalizeContact(contact({ nickname: "  Fer\ndie  " })).nickname).toBe("Fer die");
  });
});

describe("mapOwnProfile pair", () => {
  it("maps the player's own pair and partner", () => {
    const profile = mapOwnProfile({
      player: { id: "p1", name: "PLAYER ONE" },
      pair: {
        number: 124,
        published: false,
        partner: { id: "p2", name: "PARTNER TWO" },
      },
    });
    expect(profile?.pair).toEqual({
      number: 124,
      published: false,
      partner: { id: "p2", name: "PARTNER TWO" },
    });
  });

  it("leaves the pair null when the row has none", () => {
    const profile = mapOwnProfile({ player: { id: "p1", name: "PLAYER ONE" } });
    expect(profile?.pair).toBeNull();
  });
});

describe("phone shape", () => {
  it("accepts the Philippines formats people actually write", () => {
    for (const phone of [
      "0917 123 4567",
      "09171234567",
      "+63 917 123 4567",
      "+639171234567",
      "0917-123-4567",
      "(0917) 123 4567",
      "0063 917 123 4567",
      "639171234567",
    ]) {
      expect(validateContact(contact({ phone })).errors.phone, phone).toBeUndefined();
    }
  });

  it("accepts an empty number, because the club may already have it", () => {
    expect(validateContact(contact({ phone: "" })).ok).toBe(true);
  });

  it("refuses letters, a short number and a number that is too long", () => {
    expect(validateContact(contact({ phone: "call me" })).errors.phone).toBe(
      "profile.contact.errorPhone",
    );
    expect(validateContact(contact({ phone: "12345" })).errors.phone).toBe(
      "profile.contact.errorPhone",
    );
    expect(validateContact(contact({ phone: "123 456 789 012 345 6" })).errors.phone).toBe(
      "profile.contact.errorPhone",
    );
  });

  it("refuses two plus signs and a stored value longer than the column's habit", () => {
    expect(validateContact(contact({ phone: "+63 +917" })).errors.phone).toBe(
      "profile.contact.errorPhone",
    );
    expect(validateContact(contact({ phone: "+63 917 123 4567 890 123" })).errors.phone).toBe(
      "profile.contact.errorPhone",
    );
  });
});

describe("email shape", () => {
  it("accepts an address with one @ and a suffix", () => {
    expect(validateContact(contact({ email: "ferdie.salazar@example.com" })).ok).toBe(true);
    expect(validateContact(contact({ email: "a@b.ph" })).ok).toBe(true);
  });

  it("refuses a half-typed address and one with spaces", () => {
    for (const email of [
      "ferdie",
      "ferdie@",
      "ferdie@example",
      "fer die@example.com",
      "@example.com",
    ]) {
      expect(validateContact(contact({ email })).errors.email, email).toBe(
        "profile.contact.errorEmail",
      );
    }
  });
});

describe("nickname", () => {
  it("allows 24 characters and refuses the 25th", () => {
    expect(validateContact(contact({ nickname: "a".repeat(24) })).ok).toBe(true);
    expect(validateContact(contact({ nickname: "a".repeat(25) })).errors.nickname).toBe(
      "profile.contact.errorNickname",
    );
  });

  it("counts after a pasted line with a newline is cleaned", () => {
    expect(validateContact(contact({ nickname: "  Ferdie  \n" })).values.nickname).toBe("Ferdie");
  });
});

describe("validateContact", () => {
  it("reports each bad field on its own and keeps the good ones", () => {
    const result = validateContact(contact({ phone: "abc", email: "nope", nickname: "Ferdie" }));
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual({
      phone: "profile.contact.errorPhone",
      email: "profile.contact.errorEmail",
    });
    expect(result.values.nickname).toBe("Ferdie");
  });
});

describe("hasContactChanges", () => {
  it("ignores whitespace-only edits", () => {
    expect(
      hasContactChanges(
        contact({ phone: "0917 123 4567", nickname: "Ferdie" }),
        contact({ phone: " 0917 123 4567 ", nickname: " Ferdie " }),
      ),
    ).toBe(false);
  });

  it("sees a real edit", () => {
    expect(hasContactChanges(contact({ nickname: "Ferdie" }), contact({ nickname: "Ferd" }))).toBe(
      true,
    );
  });
});

describe("mapOwnProfile", () => {
  it("maps the row the database returns", () => {
    const profile = mapOwnProfile({
      linked: true,
      player: { id: "p1", name: "Ferdinand Salazar", ngapId: "30177" },
      contact: { phone: "0917 123 4567", email: "f@example.com", nickname: "Ferdie" },
      handicap: { index: 11.4, effectiveDate: "2026-11-05" },
      membership: { type: "member", memberNumber: "M-0182" },
      club: { name: "Iloilo Golf and Country Club" },
      photo: { private: true, public: false, publicConsentAt: null },
    });

    expect(profile).not.toBeNull();
    expect(profile?.handicap).toEqual({ index: 11.4, effectiveDate: "2026-11-05" });
    expect(profile?.membership.type).toBe("member");
    expect(profile?.clubName).toBe("Iloilo Golf and Country Club");
    expect(profile?.photo).toEqual({ private: true, public: false, publicConsentAt: null });
  });

  it("reads a numeric index that arrived as a string", () => {
    const profile = mapOwnProfile({
      player: { id: "p1", name: "Ferdinand Salazar" },
      handicap: { index: "11.4" },
    });
    expect(profile?.handicap.index).toBe(11.4);
  });

  it("treats an empty row or a row without a player as not linked", () => {
    expect(mapOwnProfile(null)).toBeNull();
    expect(mapOwnProfile({})).toBeNull();
    expect(mapOwnProfile({ linked: false })).toBeNull();
  });

  it("ignores a membership type it does not know", () => {
    const profile = mapOwnProfile({
      player: { id: "p1", name: "Ferdinand Salazar" },
      membership: { type: "vip" },
    });
    expect(profile?.membership.type).toBeNull();
  });
});

const entry = (over: Partial<PortalEntry>): PortalEntry => ({
  tournamentId: "event-1",
  eventName: "Event",
  eventDate: "2026-11-12",
  dates: ["2026-11-12"],
  startFormat: "shotgun",
  firstTeeTime: "06:30",
  state: "published",
  status: "ok",
  reasons: [],
  frozenIndex: 12.4,
  playingHandicap: 14,
  category: null,
  tee: null,
  flight: null,
  paymentStatus: "paid",
  published: true,
  start: null,
  starts: [],
  scorecards: [],
  ...over,
});

describe("indexFromEntries", () => {
  it("takes the index from the latest dated entry", () => {
    const result = indexFromEntries([
      entry({ tournamentId: "a", dates: ["2026-10-02"], frozenIndex: 13.1 }),
      entry({ tournamentId: "b", dates: ["2026-11-12"], frozenIndex: 11.4 }),
    ]);
    expect(result).toEqual({ index: 11.4, effectiveDate: "2026-11-12" });
  });

  it("skips entries with no frozen index", () => {
    expect(
      indexFromEntries([
        entry({ tournamentId: "a", dates: ["2026-11-12"], frozenIndex: null }),
        entry({ tournamentId: "b", dates: ["2026-10-02"], frozenIndex: 13.1 }),
      ]),
    ).toEqual({ index: 13.1, effectiveDate: "2026-10-02" });
  });

  it("returns null when there is nothing to read", () => {
    expect(indexFromEntries([])).toBeNull();
    expect(indexFromEntries([entry({ frozenIndex: null })])).toBeNull();
  });
});
