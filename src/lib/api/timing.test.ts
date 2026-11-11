import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { acceptRequestId, serverTiming, withApiTiming } from "./timing";

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/test", { headers });
}

describe("request ids and timing headers", () => {
  it("accepts a safe client id and replaces anything else", () => {
    expect(acceptRequestId("req-12345678")).toBe("req-12345678");
    expect(acceptRequestId("short")).not.toBe("short");
    expect(acceptRequestId("bad id with spaces")).not.toBe("bad id with spaces");
    expect(acceptRequestId(null)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("formats the regulation's total timing header", () => {
    expect(serverTiming(142.34)).toBe("total;dur=142.3");
  });
});

describe("withApiTiming", () => {
  it("adds both headers and keeps the handler body", async () => {
    const handler = withApiTiming("GET /api/test", async () => Response.json({ ok: true }));
    const response = await handler(request({ "x-request-id": "client-request-1" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("x-request-id")).toBe("client-request-1");
    expect(response.headers.get("server-timing")).toMatch(/^total;dur=\d+\.\d$/);
  });

  it("turns an uncaught error into the error envelope with the same request id", async () => {
    const handler = withApiTiming("GET /api/test", async () => {
      throw new Error("boom");
    });
    const response = await handler(request({ "x-request-id": "client-request-2" }));
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; request_id?: string };
    };

    expect(response.status).toBe(500);
    expect(body.error?.code).toBe("INTERNAL_ERROR");
    expect(body.error?.request_id).toBe("client-request-2");
    expect(response.headers.get("x-request-id")).toBe("client-request-2");
    expect(response.headers.get("server-timing")).toMatch(/^total;dur=/);
  });

  it("preserves a 304 with no body and still instruments it", async () => {
    const handler = withApiTiming("GET /api/test", async () => new Response(null, { status: 304 }));
    const response = await handler(request());

    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("server-timing")).toMatch(/^total;dur=/);
  });
});
