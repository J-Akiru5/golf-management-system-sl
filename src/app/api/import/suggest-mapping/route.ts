import { NextResponse } from "next/server";
import { canonicalFieldListForPrompt, parseAiMapping } from "@/lib/import/mapping";
import { importSession } from "@/lib/import/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_SHAPES = new Set([
  "text",
  "date",
  "email",
  "phone",
  "number",
  "short",
  "date words",
  "empty",
]);

const recent = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - 10 * 60 * 1000;
  const list = (recent.get(userId) ?? []).filter((t) => t > windowStart);
  if (list.length >= 12) return true;
  list.push(now);
  recent.set(userId, list);
  return false;
}

/**
 * Optional AI column proposal. Only headers and one-word value shapes are sent; no player names,
 * emails, phone numbers or row values leave the server. The answer is validated as a mapping and
 * can never contain SQL, a player id or a write instruction.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await importSession();
  if (!session.ok) {
    return NextResponse.json({ ok: false, message: session.message }, { status: session.status });
  }
  if (rateLimited(session.userId)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Too many AI mapping requests. Wait a few minutes or map the columns by hand.",
      },
      { status: 429 },
    );
  }

  const base = process.env.IMPORT_AI_BASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.IMPORT_AI_API_KEY?.trim();
  const model = process.env.IMPORT_AI_MODEL?.trim();
  if (!base || !key || !model) {
    return NextResponse.json({
      available: false,
      reason:
        "No AI mapping endpoint is configured. The deterministic mapping is shown; map anything uncertain by hand.",
    });
  }

  let body: { headers?: unknown; shapes?: unknown };
  try {
    body = (await request.json()) as { headers?: unknown; shapes?: unknown };
  } catch {
    return NextResponse.json(
      { available: true, error: "The request is not JSON." },
      { status: 400 },
    );
  }
  const headers = Array.isArray(body.headers)
    ? body.headers
        .filter((h): h is string => typeof h === "string")
        .map((h) => h.slice(0, 120))
        .slice(0, 120)
    : [];
  if (!headers.length) {
    return NextResponse.json(
      { available: true, error: "No headers were supplied." },
      { status: 400 },
    );
  }
  const shapes: Record<string, string[]> = {};
  if (body.shapes && typeof body.shapes === "object" && !Array.isArray(body.shapes)) {
    for (const header of headers) {
      const raw = (body.shapes as Record<string, unknown>)[header];
      shapes[header] = Array.isArray(raw)
        ? raw.filter((v): v is string => typeof v === "string" && ALLOWED_SHAPES.has(v)).slice(0, 6)
        : [];
    }
  }

  const prompt = [
    "You map the columns of a golf tournament registration workbook to canonical fields.",
    "Return ONLY a JSON object, no markdown, with this shape:",
    '{"mapping":{"<field>":"<exact header or null>"},"confidence":{"<field>":0.0},"reasons":{"<field>":"short reason"},"fixedMembershipType":null,"notes":["..."]}',
    `Allowed fields: ${canonicalFieldListForPrompt().join(", ")} plus memberName and guestName.`,
    "A workbook may have separate MEMBER and GUEST name columns: map them to memberName and guestName.",
    "Never invent a column that is not in the header list.",
    "Never return SQL, code, player data, or instructions to write to the database.",
    "If a field is not present, leave it out or set it to null.",
    "Only the header names and value shapes are provided; no personal data is available to you.",
    `Headers: ${JSON.stringify(headers)}`,
    `Value shapes: ${JSON.stringify(shapes)}`,
  ].join("\n");

  let response: Response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a careful data-mapping function. Return JSON only." },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return NextResponse.json({
      available: true,
      error:
        e instanceof Error
          ? `The AI endpoint did not answer: ${e.message}`
          : "The AI endpoint did not answer.",
    });
  }

  if (!response.ok) {
    return NextResponse.json({
      available: true,
      error: `The AI endpoint refused the request (${response.status}).`,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return NextResponse.json({
      available: true,
      error: "The AI endpoint returned a non-JSON answer.",
    });
  }

  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]
    ?.message?.content;
  if (typeof content !== "string") {
    return NextResponse.json({ available: true, error: "The AI answer had no message content." });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
  } catch {
    return NextResponse.json({ available: true, error: "The AI answer was not valid JSON." });
  }

  const validated = parseAiMapping(parsed, headers);
  if (!validated.ok) {
    return NextResponse.json({
      available: true,
      error: `The AI proposal was rejected: ${validated.error ?? "invalid shape"}`,
    });
  }
  return NextResponse.json({ available: true, suggestion: validated.suggestion });
}
