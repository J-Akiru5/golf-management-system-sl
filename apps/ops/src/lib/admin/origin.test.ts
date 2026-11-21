import { describe, expect, it } from "vitest";
import { originFromHeaders } from "./origin";

describe("originFromHeaders", () => {
  it("uses the forwarded host and protocol behind a proxy", () => {
    expect(
      originFromHeaders(
        new Headers({
          "x-forwarded-host": "ops.teeline.test",
          "x-forwarded-proto": "https",
          host: "internal:3000",
        }),
      ),
    ).toBe("https://ops.teeline.test");
  });

  it("uses http for a local run", () => {
    expect(originFromHeaders(new Headers({ host: "localhost:3200" }))).toBe(
      "http://localhost:3200",
    );
    expect(originFromHeaders(new Headers({ host: "127.0.0.1:3200" }))).toBe(
      "http://127.0.0.1:3200",
    );
  });

  it("is null without a host, so an action can refuse rather than guess", () => {
    expect(originFromHeaders(new Headers())).toBeNull();
  });
});
