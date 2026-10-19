import { describe, expect, it } from "vitest";
import { OFFLINE_WRITE_NOTICE } from "@/lib/offline/cache";
import { createQueue } from "./adapters";

/** The piece of the Supabase adapters that decides whether a write is allowed to start. */

describe("the write queue offline guard", () => {
  it("refuses before the work starts, says why, and never queues it", async () => {
    const errors: string[] = [];
    const busy: boolean[] = [];
    let ran = false;
    const enqueue = createQueue({
      onError: (message) => errors.push(message),
      onSaved: () => {},
      onBusy: (value) => busy.push(value),
      canWrite: () => false,
    });

    await enqueue(async () => {
      ran = true;
    });

    expect(ran).toBe(false);
    expect(errors).toEqual([OFFLINE_WRITE_NOTICE]);
    expect(busy).toEqual([]);
  });

  it("runs the work and reports busy while it is in flight when allowed", async () => {
    const busy: boolean[] = [];
    let saved = 0;
    let ran = 0;
    const enqueue = createQueue({
      onError: () => {},
      onSaved: () => {
        saved += 1;
      },
      onBusy: (value) => busy.push(value),
      canWrite: () => true,
    });

    await enqueue(async () => {
      ran += 1;
    });

    expect(ran).toBe(1);
    expect(saved).toBe(1);
    expect(busy).toEqual([true, false]);
  });

  it("turns a network failure into the plain offline sentence", async () => {
    const errors: string[] = [];
    const enqueue = createQueue({
      onError: (message) => errors.push(message),
      onSaved: () => {},
      onBusy: () => {},
      canWrite: () => true,
    });

    await enqueue(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(errors).toEqual([OFFLINE_WRITE_NOTICE]);
  });

  it("keeps a real database refusal as it was written", async () => {
    const errors: string[] = [];
    const enqueue = createQueue({
      onError: (message) => errors.push(message),
      onSaved: () => {},
      onBusy: () => {},
      canWrite: () => true,
    });

    await enqueue(async () => {
      throw new Error("new row violates row-level security policy");
    });

    expect(errors).toEqual(["new row violates row-level security policy"]);
  });
});
