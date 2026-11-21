// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument,
}));

import { PDF_NO_TEXT_MESSAGE, prepareImport, readPdfDocument } from "./import";

type FakePage = { items: unknown[] };

function fakeDocument(pages: FakePage[], title?: string) {
  return {
    numPages: pages.length,
    getPage: async (number: number) => ({
      getTextContent: async () => ({ items: pages[number - 1]?.items ?? [] }),
    }),
    getMetadata: async () => ({
      info: title === undefined ? {} : { Title: title },
      metadata: null,
    }),
    destroy: async () => undefined,
  };
}

function textItem(str: string, x: number, y: number, height = 12) {
  return {
    str,
    dir: "ltr",
    transform: [1, 0, 0, height, x, y],
    width: str.length * height * 0.5,
    height,
    fontName: "Body",
    hasEOL: false,
  };
}

function loadingTask(pages: FakePage[], title?: string) {
  return {
    promise: Promise.resolve(fakeDocument(pages, title)),
    destroy: async () => undefined,
  };
}

function pdfFile(name = "report.pdf") {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
}

beforeEach(() => {
  getDocument.mockReset();
});

describe("reading a PDF", () => {
  it("turns the page items into editor HTML and prefers a real metadata title", async () => {
    getDocument.mockReturnValue(
      loadingTask(
        [
          {
            items: [
              textItem("Analytics report", 72, 740, 18),
              textItem("The body text runs on for a while.", 72, 700, 10),
            ],
          },
        ],
        "Club analytics",
      ),
    );

    const result = await readPdfDocument(pdfFile());

    expect(result.html).toContain("<h2>Analytics report</h2>");
    expect(result.html).toContain("<p>The body text runs on for a while.</p>");
    expect(result.title).toBe("Club analytics");
  });

  it("returns empty HTML when the PDF has no text layer, so a scan creates nothing", async () => {
    getDocument.mockReturnValue(loadingTask([{ items: [] }]));

    const result = await readPdfDocument(pdfFile("scan.pdf"));

    expect(result.html).toBe("");
    expect(result.title).toBe("scan");
  });
});

describe("prepareImport", () => {
  it("refuses a scan with the scan message", async () => {
    getDocument.mockReturnValue(loadingTask([{ items: [] }]));

    await expect(prepareImport(pdfFile("scan.pdf"))).rejects.toThrow(PDF_NO_TEXT_MESSAGE);
  });

  it("refuses an unsupported file before it is read", async () => {
    const file = new File(["not a document"], "deck.pptx");

    await expect(prepareImport(file)).rejects.toThrow(/\.pdf/);
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("still reads a Markdown file without touching pdf.js", async () => {
    const file = new File(["# Notes\n\nBody"], "notes.md");

    const result = await prepareImport(file);

    expect(result.html).toContain("<h1>Notes</h1>");
    expect(result.title).toBe("Notes");
    expect(getDocument).not.toHaveBeenCalled();
  });
});
