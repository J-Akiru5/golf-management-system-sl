import type { NextRequest } from "next/server";

/**
 * The one timing layer for the route handlers that expose an HTTP API.
 *
 * It is deliberately not in individual handlers: a handler that forgets to call it must not be
 * able to report a fast request. Every response, success or error, carries `X-Request-Id` and
 * `Server-Timing`, and anything over the regulation's 300 ms / 400 ms lines is logged with the
 * route template, not the raw URL.
 *
 * `API_REGULATION.md` §9 is the contract. The Supabase RPCs underneath the public pages are not
 * HTTP endpoints and are measured by `pnpm api:check` through the page they feed.
 */

export const REQUEST_ID_HEADER = "x-request-id";
export const SERVER_TIMING_HEADER = "server-timing";

const SLOW_MS = 300;
const VIOLATION_MS = 400;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function newRequestId(): string {
  return crypto.randomUUID();
}

/** A client may supply an id, but only a short, safe token; anything else is replaced. */
export function acceptRequestId(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && SAFE_REQUEST_ID.test(trimmed) ? trimmed : newRequestId();
}

export function serverTiming(durationMs: number): string {
  return `total;dur=${durationMs.toFixed(1)}`;
}

export interface ApiTimingEvent {
  route: string;
  method: string;
  status: number;
  durationMs: number;
  requestId: string;
}

/** One gate: a slow request is a warning, a request over the hard ceiling is an error. */
export function logApiTiming(event: ApiTimingEvent): void {
  if (event.durationMs > VIOLATION_MS) {
    console.error("ERROR VIOLATION", event);
  } else if (event.durationMs > SLOW_MS) {
    console.warn("WARN SLOW", event);
  }
}

export type TimedHandler = (request: NextRequest, requestId: string) => Promise<Response>;

/**
 * Wraps one route handler. The response body and status are kept exactly as the handler returned
 * them; only the two observability headers are added. An uncaught handler error becomes the
 * regulation's error envelope, because a 500 without a request id cannot be correlated.
 */
export function withApiTiming(
  route: string,
  handler: TimedHandler,
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest): Promise<Response> => {
    const started = performance.now();
    const requestId = acceptRequestId(request.headers.get(REQUEST_ID_HEADER));

    let response: Response;
    try {
      response = await handler(request, requestId);
    } catch {
      response = Response.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "The request could not be completed.",
            request_id: requestId,
          },
        },
        { status: 500 },
      );
    }

    const durationMs = performance.now() - started;
    const headers = new Headers(response.headers);
    headers.set("X-Request-Id", requestId);
    headers.set(SERVER_TIMING_HEADER, serverTiming(durationMs));
    logApiTiming({
      route,
      method: request.method,
      status: response.status,
      durationMs,
      requestId,
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
