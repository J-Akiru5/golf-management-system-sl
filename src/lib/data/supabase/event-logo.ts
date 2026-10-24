import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const BUCKET = "event-logos";

function parseImage(dataUrl: string): { blob: Blob; extension: string; contentType: string } {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("The event logo must be a PNG, JPEG or WebP image.");
  const subtype = match[1] === "jpg" ? "jpeg" : match[1];
  const encoded = match[2];
  if (!subtype || !encoded) throw new Error("The event logo could not be read.");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  } catch {
    throw new Error("The event logo could not be read.");
  }
  return {
    blob: new Blob([bytes as unknown as BlobPart], { type: `image/${subtype}` }),
    extension: subtype === "jpeg" ? "jpg" : subtype,
    contentType: `image/${subtype}`,
  };
}

async function sign(client: SupabaseClient<Database>, path: string): Promise<string> {
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 7 * 24 * 60 * 60);
  if (error) throw new Error(`Could not open the event logo: ${error.message}`);
  return data.signedUrl;
}

export async function saveEventLogo(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
  logoDataUrl: string,
  previousPath?: string | null,
): Promise<{ path: string; url: string }> {
  const { blob, extension, contentType } = parseImage(logoDataUrl);
  const path = `${clubId}/${tournamentId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await client.storage.from(BUCKET).upload(path, blob, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw new Error(`Could not save the event logo: ${uploadError.message}`);

  const { data: updated, error: updateError } = await client
    .from("tournaments")
    .update({ logo_path: path })
    .eq("club_id", clubId)
    .eq("id", tournamentId)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    await client.storage.from(BUCKET).remove([path]);
    throw new Error(
      `Could not save the event logo: ${updateError?.message ?? "the event was not found."}`,
    );
  }

  if (previousPath && previousPath !== path && previousPath.startsWith(`${clubId}/`)) {
    await client.storage
      .from(BUCKET)
      .remove([previousPath])
      .catch(() => undefined);
  }
  let url = "";
  try {
    url = await sign(client, path);
  } catch {
    // The object is saved even if the short-lived preview cannot be signed; a reload can retry.
  }
  return { path, url };
}

export async function deleteEventLogo(
  client: SupabaseClient<Database>,
  clubId: string,
  tournamentId: string,
  previousPath: string | null | undefined,
): Promise<void> {
  const { data: updated, error } = await client
    .from("tournaments")
    .update({ logo_path: null })
    .eq("club_id", clubId)
    .eq("id", tournamentId)
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    throw new Error(
      `Could not remove the event logo: ${error?.message ?? "the event was not found."}`,
    );
  }
  if (previousPath?.startsWith(`${clubId}/`)) {
    await client.storage.from(BUCKET).remove([previousPath]);
  }
}

export async function signedEventLogo(
  client: SupabaseClient<Database>,
  path: string | null | undefined,
): Promise<string | undefined> {
  if (!path) return undefined;
  try {
    return await sign(client, path);
  } catch {
    return undefined;
  }
}
