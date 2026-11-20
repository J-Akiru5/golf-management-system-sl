import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Avatar } from "./avatar";

/**
 * A small render test. It also proves that a `.tsx` test file compiles here, which is what the
 * later workstreams need for component tests.
 */
describe("Avatar", () => {
  it("renders the initials of the name", () => {
    expect(renderToStaticMarkup(<Avatar id="user-1" name="Mia Member" />)).toContain("MM");
  });

  it("is decorative, because the name is always beside it", () => {
    expect(renderToStaticMarkup(<Avatar id="user-1" name="Mia Member" />)).toContain(
      'aria-hidden="true"',
    );
  });
});
