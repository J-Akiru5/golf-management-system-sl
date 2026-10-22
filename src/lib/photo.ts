/**
 * Public URL for a photo the player explicitly allowed on public pages. The database only returns
 * paths from the public bucket after checking `photo_public_consent_at`; this helper only turns that
 * path into a URL. No private bucket path belongs here.
 */
export function publicPhotoUrl(path: string | null | undefined): string | undefined {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  if (!path || !base) return undefined;
  return `${base}/storage/v1/object/public/player-photos-public/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/** Shrinks a photo so the desk never holds multi-megabyte images. 900px is enough for a poster. */
export async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error("Could not read that photo."));
      i.src = url;
    });
    const side = 900;
    const scale = Math.min(1, side / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}
