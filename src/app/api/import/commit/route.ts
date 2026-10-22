import { NextResponse } from "next/server";
import { idempotencyKey, parseWorkbook } from "@/lib/import/file";
import { validateDayColumns, validateMapping } from "@/lib/import/mapping";
import { buildPreview, toCommitRows } from "@/lib/import/preview";
import {
  importSession,
  loadTournamentImportContext,
  sha256,
  storeOriginalUpload,
} from "@/lib/import/server";
import type { ColumnMapping, RowDecision } from "@/lib/import/types";
import type { Json } from "@/lib/supabase/types";

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
  if (!(file instanceof File)) return jsonError(400, "Choose the same file that was previewed.");
  if (file.size === 0) return jsonError(400, "The file is empty.");
  if (file.size > 10 * 1024 * 1024) return jsonError(400, "The file is larger than 10 MB.");
  const approval = String(form.get("approval") ?? "") === "true";
  if (!approval) {
    return jsonError(
      400,
      "Tick the approval box after reviewing the preview. A file is never committed silently.",
    );
  }

  const tournamentId = String(form.get("tournamentId") ?? "");
  if (!tournamentId) return jsonError(400, "Choose the event before importing.");

  const expectedSha = String(form.get("fileSha256") ?? "");
  const buffer = Buffer.from(await file.arrayBuffer());
  const digest = sha256(buffer);
  if (expectedSha && expectedSha !== digest) {
    return jsonError(
      409,
      "The file changed since the preview. Preview it again before committing.",
    );
  }

  const worksheet =
    typeof form.get("worksheet") === "string" ? String(form.get("worksheet")) : null;
  const dateFormatRaw = String(form.get("dateFormat") ?? "mdy");
  const dateFormat = dateFormatRaw === "dmy" || dateFormatRaw === "iso" ? dateFormatRaw : "mdy";

  let parsed: Awaited<ReturnType<typeof parseWorkbook>>;
  try {
    parsed = await parseWorkbook(buffer, file.name, worksheet);
  } catch (e) {
    return jsonError(400, e instanceof Error ? e.message : "The workbook could not be read.");
  }

  const mappingInput = parseJsonField<{
    mapping?: unknown;
    fixedMembershipType?: unknown;
    dayColumns?: unknown;
  }>(form.get("mapping"));
  if (!mappingInput)
    return jsonError(400, "The column mapping is missing. Preview the file again.");
  const validation = validateMapping(
    mappingInput.mapping,
    parsed.table.headers,
    mappingInput.fixedMembershipType,
  );
  const dayValidation = validateDayColumns(mappingInput.dayColumns, parsed.table.headers);
  const mappingErrors = [...validation.errors, ...dayValidation.errors];
  if (!validation.ok || !dayValidation.ok) {
    return jsonError(400, mappingErrors.join(" "), { mappingErrors });
  }

  const contextResult = await loadTournamentImportContext(
    session.client,
    session.member.clubId,
    tournamentId,
  );
  if (!contextResult.ok) return jsonError(404, contextResult.message);
  const context = contextResult.context;
  if (!context.schemaReady) {
    return jsonError(
      409,
      "This database has not applied migration 20261037000000. The import is blocked until it is applied; nothing was written.",
      { schemaProblems: context.schemaProblems },
    );
  }

  const decisions = parseJsonField<Record<number, RowDecision>>(form.get("decisions")) ?? {};
  const dayOverrides = parseJsonField<Record<number, number[]>>(form.get("dayOverrides")) ?? {};

  const preview = buildPreview(parsed.table, {
    fileName: file.name,
    worksheet: parsed.sheetName,
    fileSha256: digest,
    fileSize: file.size,
    tournamentId,
    mapping: {
      mapping: validation.mapping,
      dayColumns: dayValidation.dayColumns,
      confidence: {},
      reasons: {},
      unmappedHeaders: [],
      fixedMembershipType: validation.fixedMembershipType,
      source: "manual",
      notes: [],
    },
    dateFormat,
    days: context.days,
    dayRule: context.dayRule,
    existingPlayers: context.existingPlayers,
    existingRegistrations: context.existingRegistrations,
    decisions,
    dayOverrides,
    schemaReady: true,
  });

  if (preview.summary.needsDecision > 0) {
    return jsonError(
      409,
      `${preview.summary.needsDecision} row(s) still need a decision. Nothing was written.`,
      { block: "decision", preview },
    );
  }

  let storagePath =
    typeof form.get("storagePath") === "string" ? String(form.get("storagePath")) : null;
  if (storagePath && !storagePath.startsWith(`${session.member.clubId}/${digest}/`)) {
    return jsonError(
      409,
      "The stored file path does not belong to this file and club. Preview it again.",
    );
  }
  if (!storagePath) {
    const upload = await storeOriginalUpload(
      session.client,
      session.member.clubId,
      digest,
      file.name,
      buffer,
    );
    storagePath = upload.path;
    if (!storagePath) {
      return jsonError(
        409,
        upload.warning ?? "The original upload could not be preserved, so nothing was written.",
      );
    }
  }

  const rows = toCommitRows(preview.rows);
  const key = idempotencyKey("registration", tournamentId, digest);

  const { data, error } = await session.client.rpc("commit_registration_import", {
    p_tournament: tournamentId,
    p_file_name: file.name,
    p_worksheet: parsed.sheetName,
    p_file_sha256: digest,
    p_storage_path: storagePath,
    p_mapping: validation.mapping as Json,
    p_rows: rows as unknown as Json,
    p_idempotency_key: key,
  });

  if (error) {
    const missing = error.code === "PGRST202" || /function .* does not exist/i.test(error.message);
    return jsonError(
      missing ? 409 : 500,
      missing
        ? "The import function is not in the database. Apply migration 20261037000000; nothing was written."
        : `The import was refused: ${error.message}`,
    );
  }

  const result = (data ?? {}) as Record<string, unknown>;
  const batchId = typeof result.batchId === "string" ? result.batchId : "";
  if (!batchId) {
    return jsonError(
      502,
      "The database did not return a batch id, so the result cannot be verified.",
    );
  }

  // Independent verification, outside the function that wrote the rows.
  const { data: batch, error: batchError } = await session.client
    .from("import_batches")
    .select("status, row_count, inserted_count, updated_count, skipped_count, rejected_count")
    .eq("club_id", session.member.clubId)
    .eq("id", batchId)
    .maybeSingle();
  if (batchError) {
    return jsonError(
      502,
      `The batch was written but could not be read back: ${batchError.message}`,
      {
        batchId,
        result,
      },
    );
  }

  const { data: registrationRows, error: registrationError } = await session.client
    .from("registrations")
    .select("id, player_id")
    .eq("club_id", session.member.clubId)
    .eq("import_batch_id", batchId);
  if (registrationError) {
    return jsonError(
      502,
      `The batch was written but its registrations could not be verified: ${registrationError.message}`,
      {
        batchId,
        result,
      },
    );
  }

  const registrationIds = (registrationRows ?? []).map((row) => row.id);
  let dayCount = 0;
  if (registrationIds.length) {
    const { count, error: dayError } = await session.client
      .from("registration_days")
      .select("id", { count: "exact", head: true })
      .eq("club_id", session.member.clubId)
      .in("registration_id", registrationIds)
      .eq("selected", true);
    if (dayError) {
      return jsonError(
        502,
        `The batch was written but its day selections could not be verified: ${dayError.message}`,
        {
          batchId,
          result,
        },
      );
    }
    dayCount = count ?? 0;
  }

  const { data: outcomeRows, error: outcomeError } = await session.client
    .from("import_rows")
    .select("status, normalized")
    .eq("club_id", session.member.clubId)
    .eq("batch_id", batchId);
  if (outcomeError) {
    return jsonError(
      502,
      `The batch was written but its row outcomes could not be verified: ${outcomeError.message}`,
      {
        batchId,
        result,
      },
    );
  }

  const committedRows = (outcomeRows ?? []).filter((row) => row.status === "committed");
  const expectedRegistrations = committedRows.length;
  const expectedDays = committedRows.reduce((sum, row) => {
    const normalized = row.normalized;
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return sum;
    const days = (normalized as Record<string, unknown>).days;
    return sum + (Array.isArray(days) ? days.length : 0);
  }, 0);
  const alreadyCommitted = Boolean(result.alreadyCommitted);
  const verification = {
    ok:
      Boolean(batch) &&
      (alreadyCommitted ||
        (registrationIds.length === expectedRegistrations &&
          dayCount === expectedDays &&
          expectedRegistrations === Number(result.inserted ?? 0) + Number(result.updated ?? 0))),
    batchId,
    alreadyCommitted,
    registrations: registrationIds.length,
    expectedRegistrations,
    days: dayCount,
    expectedDays,
    batchStatus: batch?.status ?? null,
    checkedAt: new Date().toISOString(),
  };

  if (!verification.ok) {
    return jsonError(
      502,
      "The database accepted the batch but the independent read-back does not match. Do not treat this as a success; check the batch before retrying.",
      { result, verification },
    );
  }

  return NextResponse.json({
    ...result,
    ok: true,
    partial: Boolean(result.partial) || Number(result.rejected ?? 0) > 0,
    verification,
  });
}
