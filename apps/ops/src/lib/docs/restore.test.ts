import { describe, expect, it } from "vitest";
import type { EditorJson } from "@/lib/db/types";
import { beforeRestoreName, planRestore, PRE_RESTORE_PREFIX, restoreNotice } from "./restore";

const content: EditorJson = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Older words" }] }],
};

describe("planRestore", () => {
  it("saves the current state before it applies the older content", () => {
    const steps = planRestore({ snapshot: { name: "First draft", content } });
    expect(steps.map((step) => step.op)).toEqual(["create_snapshot", "apply_content"]);
    const first = steps[0];
    expect(first).toEqual({
      op: "create_snapshot",
      kind: "pre_restore",
      name: "Before restore: First draft",
    });
  });

  it("carries the snapshot content through untouched", () => {
    const steps = planRestore({ snapshot: { name: "Old", content } });
    const apply = steps[1];
    expect(apply?.op).toBe("apply_content");
    if (apply?.op === "apply_content") expect(apply.content).toBe(content);
  });

  it("keeps the pre-restore name inside the database limit", () => {
    const name = beforeRestoreName("x".repeat(200));
    expect(name.length).toBe(120);
    expect(name.startsWith(PRE_RESTORE_PREFIX)).toBe(true);
  });
});

describe("restoreNotice", () => {
  it("names the version and the copy that was kept", () => {
    expect(restoreNotice(" First draft ")).toBe(
      'Restored "First draft". The version before it was saved as "Before restore: First draft".',
    );
  });
});
