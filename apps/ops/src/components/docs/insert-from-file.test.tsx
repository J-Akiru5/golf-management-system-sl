// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(),
}));

import { InsertFromFile } from "./insert-from-file";

/** The button never touches the editor until a file is inserted, so the gate needs no real one. */
const editor = {} as unknown as Editor;

afterEach(cleanup);

describe("Insert from file", () => {
  it("is hidden from a viewer", () => {
    render(<InsertFromFile editor={editor} canEdit={false} />);

    expect(screen.queryByRole("button", { name: "Insert from file" })).toBeNull();
  });

  it("is offered to a person with edit on documents", () => {
    render(<InsertFromFile editor={editor} canEdit />);

    expect(screen.queryAllByRole("button", { name: "Insert from file" }).length).toBe(1);
  });

  it("opens the shared picker and says that PDF images are not imported", async () => {
    render(<InsertFromFile editor={editor} canEdit />);

    fireEvent.click(screen.getByRole("button", { name: "Insert from file" }));

    expect(await screen.findByLabelText("File")).toBeTruthy();
    expect(screen.getByText("Images and charts in a PDF are not imported.")).toBeTruthy();
  });
});
