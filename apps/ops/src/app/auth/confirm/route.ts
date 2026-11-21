import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { opsEnabled } from "@/lib/flags";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * The end of an invite or password-reset email.
 *
 * Supabase puts a one-time token in the link. This route exchanges it for a session, writes the
 * session cookie and sends the person to the set-password page. Nothing else happens here: the
 * person chooses their own password, and the owner never sees it.
 */

const ACCEPTED_TYPES: ReadonlyArray<EmailOtpType> = ["invite", "recovery", "email", "magiclink"];

/** A same-site path only. "//host" and "https://host" are refused. */
function safeNext(value: string | null): string {
  const fallback = "/auth/set-password";
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

const INVALID_LINK = "That link is no longer valid. Ask a workspace owner to send another one.";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const fail = (reason: string) =>
    NextResponse.redirect(`${url.origin}/login?error=${encodeURIComponent(reason)}`);

  if (!opsEnabled()) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeNext(url.searchParams.get("next"));

  try {
    const client = await getServerSupabase();

    if (code) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) return fail(INVALID_LINK);
    } else if (tokenHash && type && ACCEPTED_TYPES.includes(type as EmailOtpType)) {
      const { error } = await client.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as EmailOtpType,
      });
      if (error) return fail(INVALID_LINK);
    } else {
      return fail(INVALID_LINK);
    }

    return NextResponse.redirect(`${url.origin}${next}`);
  } catch {
    return fail(INVALID_LINK);
  }
}
