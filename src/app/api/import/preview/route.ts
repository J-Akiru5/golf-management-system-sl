import { NextResponse } from "next/server";
import { parseWorkbook } from "@/lib/import/file";
import { suggestMapping, validateDayColumns, validateMapping } from "@/lib/import/mapping";
import { buildPreview } from "@/lib/import/preview";
import {
  importSession,
  loadTournamentImportContext,
  sha256,
  shapesForHeaders,
  storeOriginalUpload,
} from "@/lib/import/server";
import type { ColumnMapping, RowDecision } from "@/lib/import/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function parseJsonField<T>(value: FormDataEntryValue | null): T | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await importSession();
  if (!session.ok) return jsonError(session.status, session.message);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Send the file as multipart form data.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "Choose a CSV or XLSX file.");
  if (file.size === 0) return jsonError(400, "The file is empty.");
  if (file.size > 10 * 1024 * 1024) return jsonError(400, "The file is larger than 10 MB.");

  const tournamentId =
    typeof form.get("tournamentId") === "string" ? String(form.get("tournamentId")) : "";
  if (!tournamentId) return jsonError(400, "Choose the event before importing.");

  const dateFormatRaw = String(form.get("dateFormat") ?? "mdy");
  const dateFormat = dateFormatRaw === "dmy" || dateFormatRaw === "iso" ? dateFormatRaw : "mdy";
  const worksheet =
    typeof form.get("worksheet") === "string" ? String(form.get("worksheet")) : null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const digest = sha256(buffer);

  let parsed: Awaited<ReturnType<typeof parseWorkbook>>;
  try {
    parsed = await parseWorkbook(buffer, file.name, worksheet);
  } catch (e) {
    return jsonError(400, e instanceof Error ? e.message : "The workbook could not be read.");
  }

  const contextResult = await loadTournamentImportContext(
    session.client,
    session.member.clubId,
    tournamentId,
  );
  if (!contextResult.ok) return jsonError(404, contextResult.message);
  const context = contextResult.context;

  const providedMapping = parseJsonField<{
    mapping?: unknown;
    fixedMembershipType?: unknown;
    dayColumns?: unknown;
  }>(form.get("mapping"));
  let mapping;
  if (providedMapping) {
    const validation = validateMapping(
      providedMapping.mapping,
      parsed.table.headers,
      providedMapping.fixedMembershipType,
    );
    const dayValidation = validateDayColumns(providedMapping.dayColumns, parsed.table.headers);
    const mappingErrors = [...validation.errors, ...dayValidation.errors];
    if (!validation.ok || !dayValidation.ok) {
      return jsonError(400, mappingErrors.join(" "), {
        mappingErrors,
        headers: parsed.table.headers,
      });
    }
    const usedHeaders = new Set([
      ...Object.values(validation.mapping).filter((header): header is string => Boolean(header)),
      ...dayValidation.dayColumns.map((column) => column.header),
    ]);
    mapping = {
      mapping: validation.mapping,
      dayColumns: dayValidation.dayColumns,
      confidence: {},
      reasons: {},
      unmappedHeaders: parsed.table.headers.filter((header) => !usedHeaders.has(header)),
      fixedMembershipType: validation.fixedMembershipType,
      source: "manual" as const,
      notes: ["Mapping confirmed by the operator."],
    };
  } else {
    // Only headers and value shapes are sent to the optional AI; this first pass is deterministic.
    mapping = suggestMapping(parsed.table.headers, {
      samples: Object.fromEntries(
        parsed.table.headers.map((header) => [
          header,
          parsed.table.rows
            .slice(0, 8)
            .map((row) => row[parsed.table.headers.indexOf(header)] ?? ""),
        ]),
      ),
    });
  }

  const decisions = parseJsonField<Record<number, RowDecision>>(form.get("decisions")) ?? {};
  const dayOverrides = parseJsonField<Record<number, number[]>>(form.get("dayOverrides")) ?? {};

  const preview = buildPreview(parsed.table, {
    fileName: file.name,
    worksheet: parsed.sheetName,
    fileSha256: digest,
    fileSize: file.size,
    tournamentId,
    mapping,
    dateFormat,
    days: context.days,
    dayRule: context.dayRule,
    existingPlayers: context.existingPlayers,
    existingRegistrations: context.existingRegistrations,
    decisions,
    dayOverrides,
    schemaReady: context.schemaReady,
  });

  const upload = await storeOriginalUpload(
    session.client,
    session.member.clubId,
    digest,
    file.name,
    buffer,
  );

  return NextResponse.json({
    ok: true,
    preview: {
      ...preview,
      warnings: [
        ...preview.warnings,
        ...context.schemaProblems,
        ...parsed.warnings,
        ...(upload.warning ? [upload.warning] : []),
      ],
      sheets: parsed.sheets,
      sheetName: parsed.sheetName,
      storagePath: upload.path,
      shapes: shapesForHeaders(parsed.table.headers, parsed.table.rows),
      mappingErrors: [],
    },
    tournament: { id: context.tournamentId, name: context.tournamentName },
  });
}
