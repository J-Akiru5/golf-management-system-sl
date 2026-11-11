import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const configured = vi.fn(() => true);
const load = vi.fn();

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => configured() }));
vi.mock("@/lib/supabase/public", () => ({ createSupabasePublicClient: () => ({}) }));
vi.mock("@/lib/data/supabase/public-pairings", () => ({
  loadPublicPairings: (...args: unknown[]) => load(...args),
}));

import { GET } from "./route";

beforeEach(() => {
  configured.mockReturnValue(true);
  load.mockReset();
});

function callGet(headers?: Record<string, string>) {
  return GET(
    new NextRequest("http://localhost/api/v1/pairings/version", {
      headers,
    }),
  );
}

describe("GET /api/v1/pairings/version", () => {
  it("uses the regulation envelope and the same request id on every surface", async () => {
    load.mockResolvedValue({ published: { at: "2026-11-12T06:00:00+00:00", version: 4 } });
    const response = await callGet({ "x-request-id": "client-request-9" });
    const body = (await response.json()) as {
      data?: { version?: number; published?: boolean };
      meta?: { request_id?: string };
    };

    expect(response.status).toBe(200);
    expect(body.data?.version).toBe(4);
    expect(body.data?.published).toBe(true);
    expect(body.meta?.request_id).toBe("client-request-9");
    expect(response.headers.get("x-request-id")).toBe("client-request-9");
    expect(response.headers.get("server-timing")).toMatch(/^total;dur=/);
    expect(response.headers.get("etag")).toBeTruthy();
  });

  it("answers 304 for its own ETag", async () => {
    load.mockResolvedValue({ published: { at: "2026-11-12T06:00:00+00:00", version: 4 } });
    const first = await callGet();
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();

    const second = await callGet({ "if-none-match": etag ?? "" });
    expect(second.status).toBe(304);
    expect(second.headers.get("server-timing")).toMatch(/^total;dur=/);
  });

  it("uses the error envelope when the dependency is unavailable", async () => {
    configured.mockReturnValue(false);
    const response = await callGet({ "x-request-id": "client-request-10" });
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; request_id?: string };
    };

    expect(response.status).toBe(503);
    expect(body.error?.code).toBe("UNAVAILABLE");
    expect(body.error?.request_id).toBe("client-request-10");
    expect(response.headers.get("x-request-id")).toBe("client-request-10");
    expect(response.headers.get("server-timing")).toMatch(/^total;dur=/);
    expect(load).not.toHaveBeenCalled();
  });
});
