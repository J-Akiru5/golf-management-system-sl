import { NextResponse } from "next/server";
import { DeskAccessError, type DeskMember, getDeskMember } from "@/lib/auth/member";
import {
  createObjectKey,
  createPresignedUpload,
  isStorageConfigured,
  isStorageUseCase,
  StorageError,
  validateUpload,
} from "@/lib/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status });
}

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type MembershipResult =
  | { ok: true; member: DeskMember }
  | { ok: false; status: number; message: string };

async function memberFor(client: ServerClient, userId: string): Promise<MembershipResult> {
  try {
    return { ok: true, member: await getDeskMember(client, userId) };
  } catch (error) {
    if (error instanceof DeskAccessError) {
      return { ok: false, status: 403, message: error.message };
    }
    return { ok: false, status: 500, message: "The club membership could not be checked." };
  }
}

/**
 * Staff-only presign for event logos, course maps and generated documents. The caller's club is
 * read from the membership, never from the request body, so one club cannot sign into another
 * club's prefix. Scorecard scans keep their own route and key format.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let client: ServerClient;
  try {
    client = await createSupabaseServerClient();
  } catch {
    return jsonError(503, "Supabase is not configured for this deployment.");
  }

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return jsonError(401, "Sign in to upload a file.");

  const access = await memberFor(client, data.user.id);
  if (!access.ok) return jsonError(access.status, access.message);

  if (!isStorageConfigured()) {
    return jsonError(503, "File storage is not configured. Add the R2 settings and try again.");
  }

  let body: { useCase?: unknown; mime?: unknown; bytes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(400, "The upload request is not valid JSON.");
  }

  const useCase = typeof body.useCase === "string" ? body.useCase : "";
  const mime = typeof body.mime === "string" ? body.mime : "";
  const bytes = typeof body.bytes === "number" ? body.bytes : Number.NaN;

  if (!isStorageUseCase(useCase)) {
    return jsonError(400, "Choose a valid storage use case.");
  }

  try {
    validateUpload(mime, bytes);
  } catch (error) {
    if (error instanceof StorageError) return jsonError(400, error.message);
    return jsonError(400, "The upload request is not valid.");
  }

  try {
    const key = createObjectKey(access.member.clubId, useCase, mime);
    const presigned = await createPresignedUpload(key, mime, { bytes });
    return NextResponse.json({
      key,
      uploadUrl: presigned.uploadUrl,
      headers: presigned.headers,
      expiresIn: presigned.expiresIn,
    });
  } catch (error) {
    if (error instanceof StorageError) return jsonError(400, error.message);
    return jsonError(500, "The upload could not start.");
  }
}
