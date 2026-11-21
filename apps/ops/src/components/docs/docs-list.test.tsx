// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocsList } from "./docs-list";

vi.mock("@/app/(app)/docs/actions", () => ({
  createDocumentAction: vi.fn(),
  deleteDocumentAction: vi.fn(),
  renameDocumentAction: vi.fn(),
  setDocumentArchivedAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

function renderList(canEdit: boolean) {
  return render(
    <DocsList docs={[]} archived={false} search="" canEdit={canEdit} canDelete={canEdit} />,
  );
}

describe("the Documents page actions", () => {
  it("offers Import and New document with edit on documents", () => {
    renderList(true);

    expect(screen.queryAllByRole("button", { name: "Import" }).length).toBe(1);
    expect(screen.queryAllByRole("button", { name: "New document" }).length).toBeGreaterThan(0);
  });

  it("hides Import at view level, so the access registry decides it", () => {
    renderList(false);

    expect(screen.queryAllByRole("button", { name: "Import" }).length).toBe(0);
    expect(screen.queryAllByRole("button", { name: "New document" }).length).toBe(0);
  });
});
