import { describe, expect, it } from "vitest";
import { planBatchUpload } from "./batch";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

describe("planBatchUpload", () => {
  it("creates every new file in input order", () => {
    const plan = planBatchUpload(
      [
        { name: "front-1.jpg", sha256: HASH_A },
        { name: "front-2.jpg", sha256: HASH_B },
      ],
      [],
    );
    expect(plan.toCreate.map((file) => file.name)).toEqual(["front-1.jpg", "front-2.jpg"]);
    expect(plan.duplicates).toEqual([]);
    expect(plan.invalid).toEqual([]);
  });

  it("marks a repeat inside the batch and names the earlier file", () => {
    const plan = planBatchUpload(
      [
        { name: "front-1.jpg", sha256: HASH_A },
        { name: "front-1-again.jpg", sha256: HASH_A },
      ],
      [],
    );
    expect(plan.toCreate.map((file) => file.name)).toEqual(["front-1.jpg"]);
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.duplicates[0]).toMatchObject({
      name: "front-1-again.jpg",
      reason: "duplicate_in_batch",
      duplicateOf: "front-1.jpg",
    });
    expect(plan.duplicates[0]?.message).toContain("front-1.jpg");
  });

  it("marks a hash already in the inbox", () => {
    const plan = planBatchUpload([{ name: "front-1.jpg", sha256: HASH_A }], [HASH_A]);
    expect(plan.toCreate).toEqual([]);
    expect(plan.duplicates[0]).toMatchObject({
      name: "front-1.jpg",
      reason: "already_in_inbox",
      duplicateOf: null,
      message: "already in the inbox",
    });
  });

  it("compares hashes case-insensitively against the inbox", () => {
    const plan = planBatchUpload([{ name: "front-1.jpg", sha256: HASH_A }], [HASH_A.toUpperCase()]);
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.duplicates[0]?.reason).toBe("already_in_inbox");
  });

  it("compares hashes case-insensitively inside the batch", () => {
    const plan = planBatchUpload(
      [
        { name: "front-1.jpg", sha256: HASH_A },
        { name: "front-1-copy.jpg", sha256: HASH_A.toUpperCase() },
      ],
      [],
    );
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.duplicates[0]?.duplicateOf).toBe("front-1.jpg");
  });

  it("puts a hash that is not 64 hex characters in the invalid list", () => {
    const plan = planBatchUpload(
      [
        { name: "short.jpg", sha256: "abc" },
        { name: "sixty-three.jpg", sha256: "d".repeat(63) },
        { name: "not-hex.jpg", sha256: "z".repeat(64) },
        { name: "good.jpg", sha256: HASH_C },
      ],
      [],
    );
    expect(plan.toCreate.map((file) => file.name)).toEqual(["good.jpg"]);
    expect(plan.invalid.map((file) => file.name)).toEqual([
      "short.jpg",
      "sixty-three.jpg",
      "not-hex.jpg",
    ]);
    expect(plan.invalid.every((file) => file.reason === "bad_hash")).toBe(true);
    expect(plan.duplicates).toEqual([]);
  });

  it("keeps the input order in each list", () => {
    const plan = planBatchUpload(
      [
        { name: "a.jpg", sha256: HASH_A },
        { name: "bad.jpg", sha256: "nope" },
        { name: "b.jpg", sha256: HASH_B },
        { name: "a-copy.jpg", sha256: HASH_A },
      ],
      [],
    );
    expect(plan.toCreate.map((file) => file.name)).toEqual(["a.jpg", "b.jpg"]);
    expect(plan.invalid.map((file) => file.name)).toEqual(["bad.jpg"]);
    expect(plan.duplicates.map((file) => file.name)).toEqual(["a-copy.jpg"]);
  });
});
