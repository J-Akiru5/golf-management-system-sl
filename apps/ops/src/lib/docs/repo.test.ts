import { describe, expect, it } from "vitest";
import { cleanSnapshotName, cleanTitle, createDemoDocsRepo, escapeLike } from "./repo";

const PORTAL = "11111111-1111-4111-8111-111111111111";

describe("createDemoDocsRepo", () => {
  it("lists the active documents newest first and leaves archived ones out", async () => {
    const repo = createDemoDocsRepo(true);
    const active = await repo.listDocs({ archived: false });
    expect(active.map((doc) => doc.title)).toEqual([
      "Operations, cost and business portal",
      "24th Bamboo Tee, run sheet",
    ]);
    const archived = await repo.listDocs({ archived: true });
    expect(archived.map((doc) => doc.title)).toEqual(["ZenLabs retainer notes"]);
  });

  it("searches titles without regard to case", async () => {
    const repo = createDemoDocsRepo(true);
    const found = await repo.listDocs({ archived: false, search: "PORTAL" });
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(PORTAL);
    expect(await repo.listDocs({ archived: false, search: "nothing here" })).toEqual([]);
  });

  it("reads one document and returns null for a missing one", async () => {
    const repo = createDemoDocsRepo(true);
    const doc = await repo.getDoc(PORTAL);
    expect(doc?.title).toBe("Operations, cost and business portal");
    expect(doc?.lastEditedByName).toBe("Mara Santos");
    expect(await repo.getDoc("does-not-exist")).toBeNull();
  });

  it("creates, renames, archives and deletes", async () => {
    const repo = createDemoDocsRepo(true);
    const created = await repo.createDoc("  Vendor list  ");
    expect(created.title).toBe("Vendor list");
    expect(created.archived).toBe(false);
    expect(created.lastEditedByName).toBe("Demo user");

    const renamed = await repo.renameDoc(created.id, "Vendor list, 2027");
    expect(renamed.title).toBe("Vendor list, 2027");

    const archived = await repo.setArchived(created.id, true);
    expect(archived.archived).toBe(true);
    expect((await repo.listDocs({ archived: true })).map((doc) => doc.id)).toContain(created.id);

    await repo.deleteDoc(created.id);
    expect(await repo.getDoc(created.id)).toBeNull();
  });

  it("returns copies, so a caller cannot mutate the stored row", async () => {
    const repo = createDemoDocsRepo(true);
    const first = await repo.getDoc(PORTAL);
    if (!first) throw new Error("seed document missing");
    first.title = "Changed by the test";
    expect((await repo.getDoc(PORTAL))?.title).toBe("Operations, cost and business portal");
  });

  it("keeps version history per document, newest first", async () => {
    const repo = createDemoDocsRepo(true);
    const seeded = await repo.listSnapshots(PORTAL);
    expect(seeded).toHaveLength(1);
    expect(seeded[0]?.name).toBe("Imported portal draft");

    const content = (await repo.getSnapshot(seeded[0]?.id ?? ""))?.content;
    if (!content) throw new Error("seed snapshot missing content");

    const saved = await repo.createSnapshot({
      docId: PORTAL,
      name: "Second draft",
      kind: "manual",
      state: "AAA=",
      content,
    });
    expect(saved.createdByName).toBe("Demo user");
    const list = await repo.listSnapshots(PORTAL);
    expect(list.map((snapshot) => snapshot.name)).toEqual([
      "Second draft",
      "Imported portal draft",
    ]);

    await repo.deleteSnapshot(saved.id);
    expect((await repo.listSnapshots(PORTAL)).map((snapshot) => snapshot.name)).toEqual([
      "Imported portal draft",
    ]);
  });

  it("removes a document's versions with the document", async () => {
    const repo = createDemoDocsRepo(true);
    await repo.deleteDoc(PORTAL);
    expect(await repo.listSnapshots(PORTAL)).toEqual([]);
  });

  it("shares one instance unless the caller asks for fresh state", () => {
    expect(createDemoDocsRepo()).toBe(createDemoDocsRepo());
    expect(createDemoDocsRepo(true)).not.toBe(createDemoDocsRepo(true));
  });

  it("refuses a version without content", async () => {
    const repo = createDemoDocsRepo(true);
    await expect(
      repo.createSnapshot({
        docId: PORTAL,
        name: "Empty",
        kind: "manual",
        state: "AAA=",
        content: undefined as never,
      }),
    ).rejects.toThrow(/content/);
  });
});

describe("cleanTitle", () => {
  it("trims and keeps the words", () => {
    expect(cleanTitle("  Cost notes  ")).toBe("Cost notes");
  });

  it("refuses a blank title and one over the limit", () => {
    expect(() => cleanTitle("   ")).toThrow(/needs a title/);
    expect(() => cleanTitle("x".repeat(201))).toThrow(/at most 200/);
  });
});

describe("cleanSnapshotName", () => {
  it("trims and enforces the limit", () => {
    expect(cleanSnapshotName("  Before the call ")).toBe("Before the call");
    expect(() => cleanSnapshotName(" ")).toThrow(/needs a name/);
    expect(() => cleanSnapshotName("x".repeat(121))).toThrow(/at most 120/);
  });
});

describe("escapeLike", () => {
  it("escapes the wildcards so they are searched as characters", () => {
    expect(escapeLike("50%")).toBe("50\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("back\\slash")).toBe("back\\\\slash");
    expect(escapeLike("plain")).toBe("plain");
  });
});
