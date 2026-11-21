import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatPanel } from "./ChatPanel";

describe("the Teeo chat panel", () => {
  it("renders the friendly header, language picker, quick replies, and pill composer", () => {
    const html = renderToStaticMarkup(createElement(ChatPanel, { onClose: () => undefined }));

    expect(html).toContain("Your tournament concern buddy.");
    expect(html).toContain('aria-label="Language"');
    expect(html).toContain("My name is misspelled");
    expect(html).toContain("A score looks wrong");
    expect(html).toContain("Question about my tee time");
    expect(html).toContain("Handicap question");
    expect(html).toContain('role="group" aria-label="Quick replies"');
    expect(html.match(/class="tl-chat-quick-reply"/g)).toHaveLength(4);
    expect(html).toContain("Tell Teeo your concern…");
    expect(html).toContain('aria-label="Send"');
    expect(html).not.toContain('class="tl-chat-language"><label');
  });
});
