import { describe, expect, it } from "vitest";
import { buildMergeQueue, type MergeDecision, resolveImport, reviewBuckets } from "./merge";
import { parseCsv } from "./parse";
import type { ImportOptions, KnownPlayer } from "./types";

// Demo-config numbers only.

const known: KnownPlayer[] = [
  {
    id: "p1",
    fullName: "Antonio Alcantara",
    ngapId: "1001",
    birthdate: "1972-05-04",
    contactNumber: "+63 917 100 1000",
  },
  { id: "p2", fullName: "Juan Dela Cruz", ngapId: "7001", birthdate: "1988-01-20" },
  { id: "p3", fullName: "Juan Dela Cruz", ngapId: "7002", birthdate: "1969-03-11" },
  { id: "p4", fullName: "Maria Santos", ngapId: null, birthdate: null },
];

const opts = (over: Partial<ImportOptions> = {}): ImportOptions => ({
  mapping: { name: "Name", index: "Index", ngapId: "NGAP ID", effectiveDate: "Date" },
  dateFormat: "mdy",
  defaultEffectiveDate: "2026-11-01",
  ...over,
});

const csv = (body: string) => parseCsv(`Name,NGAP ID,Index,Date\n${body}`);

describe("buildMergeQueue", () => {
  it("links an exact NGAP ID match and records the signals", () => {
    const q = buildMergeQueue(csv("Antonio Alcantara,1001,12.4,11/01/2026"), known, opts());
    const row = q.rows[0];
    expect(row?.recommendation).toBe("link");
    expect(row?.matchedBy).toBe("ngap_id");
    expect(row?.candidates[0]?.confidence).toBe("exact");
    expect(row?.conflicts).toEqual([]);
  });

  it("links a single name match but does not call it exact", () => {
    const q = buildMergeQueue(csv("Maria Santos,,8.0,11/01/2026"), known, opts());
    expect(q.rows[0]?.candidates[0]?.playerId).toBe("p4");
    expect(q.rows[0]?.candidates[0]?.confidence).toBe("strong");
    expect(q.rows[0]?.recommendation).toBe("link");
  });

  it("asks for a decision when a name matches two players", () => {
    const q = buildMergeQueue(csv('"DELA CRUZ, Juan",7009,18.2,11/01/2026'), known, opts());
    const row = q.rows[0];
    expect(row?.candidates).toHaveLength(2);
    expect(row?.recommendation).toBe("review");
    expect(row?.conflicts.join(" ")).toContain("more than one player");
  });

  it("asks for a decision when the file's NGAP ID disagrees with the record", () => {
    const q = buildMergeQueue(csv("Antonio Alcantara,8888,5.0,11/01/2026"), known, opts());
    expect(q.rows[0]?.recommendation).toBe("review");
    expect(q.rows[0]?.conflicts.join(" ")).toContain("Check before importing");
  });

  it("creates a record for an unknown golfer and flags a repeated line", () => {
    const q = buildMergeQueue(
      csv("New Golfer,2002,20,11/01/2026\nMaria Santos,,9,10/01/2026\nMaria Santos,,8,11/01/2026"),
      known,
      opts(),
    );
    expect(q.rows[0]?.recommendation).toBe("create");
    expect(q.summary.create).toBe(1);
    expect(q.summary.skipped).toBe(1);
    expect(q.warnings[0]?.message).toContain("appears twice");
    // The newer line survives.
    expect(q.rows.filter((r) => !r.skip).find((r) => r.name === "Maria Santos")?.index).toBe(8);
  });

  it("uses birthdate and contact as signals when the file carries them", () => {
    const file = parseCsv(
      "Name,NGAP ID,Index,Date,Birthdate,Contact\nAntonio Alcantara,,8.0,11/01/2026,1972-05-04,+63 917 100 1000",
    );
    const queue = buildMergeQueue(file, known, {
      ...opts(),
      mapping: {
        name: "Name",
        index: "Index",
        ngapId: "NGAP ID",
        effectiveDate: "Date",
        dob: "Birthdate",
        contact: "Contact",
      },
    });
    const candidate = queue.rows[0]?.candidates[0];
    const signals = candidate?.signals.map((s) => s.kind) ?? [];
    expect(signals).toContain("name");
    expect(signals).toContain("dob");
    expect(signals).toContain("contact");
    expect(candidate?.playerId).toBe("p1");
  });
});

describe("resolveImport", () => {
  const queue = () =>
    buildMergeQueue(
      csv(
        'Antonio Alcantara,1001,12.4,11/01/2026\nJuan Newgolfer,3001,22.0,11/01/2026\n"DELA CRUZ, Juan",7009,18.2,11/01/2026',
      ),
      known,
      opts(),
    );

  it("applies clean rows without a decision and holds back the review row", () => {
    const res = resolveImport(queue(), []);
    expect(res.rows.map((r) => [r.playerId, r.createNew])).toEqual([
      ["p1", false],
      [null, true],
    ]);
    expect(res.unresolved).toHaveLength(1);
  });

  it("applies the organizer's decisions: link, create, keep separate, defer", () => {
    const decisions: MergeDecision[] = [
      { row: 1, action: "separate" },
      { row: 2, action: "defer" },
      { row: 3, action: "link", playerId: "p3" },
    ];
    const res = resolveImport(queue(), decisions);
    const byRow = new Map(res.rows.map((r) => [r.row, r]));
    expect(byRow.get(1)?.createNew).toBe(true);
    expect(byRow.get(1)?.action).toBe("separate");
    expect(byRow.get(3)?.playerId).toBe("p3");
    expect(res.deferred.map((r) => r.row)).toEqual([2]);
    expect(res.unresolved).toHaveLength(0);
  });

  it("never invents a link when a decision names nobody", () => {
    const res = resolveImport(queue(), [{ row: 3, action: "link" }]);
    // Row 3 has two candidates, so the resolver cannot choose one by itself.
    expect(res.unresolved.map((r) => r.row)).toEqual([3]);
  });
});

describe("reviewBuckets", () => {
  const queue = () =>
    buildMergeQueue(
      csv(
        'Antonio Alcantara,1001,12.4,11/01/2026\nJuan Newgolfer,3001,22.0,11/01/2026\n"DELA CRUZ, Juan",7009,18.2,11/01/2026',
      ),
      known,
      opts(),
    );

  it("puts every usable row in exactly one bucket", () => {
    const q = queue();
    const buckets = reviewBuckets(q, resolveImport(q, []));
    const all = [
      ...buckets.decided.map((r) => r.row),
      ...buckets.deferred.map((r) => r.row),
      ...buckets.needsDecision.map((r) => r.row),
    ];

    expect([...all].sort((a, b) => a - b)).toEqual(q.rows.filter((r) => !r.skip).map((r) => r.row));
    // No row is listed twice, which would double-count the tab badges.
    expect(new Set(all).size).toBe(all.length);
  });

  it("agrees with the Apply button about what still needs an answer", () => {
    const q = queue();
    const res = resolveImport(q, []);
    const buckets = reviewBuckets(q, res);
    // Apply is disabled while `unresolved` is non-empty. The tab must say the same thing.
    expect(buckets.needsDecision.length === 0).toBe(res.unresolved.length === 0);
    expect(buckets.decided.map((r) => r.row)).toEqual(res.rows.map((r) => r.row));
  });

  it("counts a deferral as settled, because the organizer did decide", () => {
    const q = queue();
    const buckets = reviewBuckets(q, resolveImport(q, [{ row: 2, action: "defer" }]));

    expect(buckets.deferred.map((r) => r.row)).toEqual([2]);
    expect(buckets.decided.map((r) => r.row)).toEqual([1]);
    expect(buckets.needsDecision.map((r) => r.row)).toEqual([3]);
    expect(buckets.progress).toEqual({ settled: 2, total: 3 });
  });

  it("reaches settled === total only when nothing is waiting", () => {
    const q = queue();
    const buckets = reviewBuckets(q, resolveImport(q, [{ row: 3, action: "create" }]));
    expect(buckets.needsDecision).toEqual([]);
    expect(buckets.progress.settled).toBe(buckets.progress.total);
    expect(buckets.progress.total).toBe(3);
  });

  it("returns the queue's own row objects, so a tab can render them", () => {
    const q = queue();
    const buckets = reviewBuckets(q, resolveImport(q, []));
    const row1 = q.rows.find((r) => r.row === 1);
    expect(buckets.decided[0]).toBe(row1);
  });
});
