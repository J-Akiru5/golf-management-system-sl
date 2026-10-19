import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ACCEPTED_TYPES: readonly EmailOtpType[] = ["recovery", "email"];

/**
 * Finishes the link in a Supabase email. The recovery link lands here, this route exchanges the
 * one-time code for a session, and the browser continues to the reset form. The proxy lets
 * `/auth/*` through untouched so the exchange can set its cookies.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const requested = url.searchParams.get("next");
  const next = requested ? safeRedirectPath(requested) : "/reset-password";
  const fail = (reason: string) => NextResponse.redirect(`${url.origin}/login?error=${reason}`);

  if (!isSupabaseConfigured()) return fail("link_invalid");

  try {
    const client = await createSupabaseServerClient();
    if (code) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) return fail("link_invalid");
    } else if (tokenHash && type && ACCEPTED_TYPES.includes(type as EmailOtpType)) {
      const { error } = await client.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as EmailOtpType,
      });
      if (error) return fail("link_invalid");
    } else {
      return fail("link_invalid");
    }
    return NextResponse.redirect(`${url.origin}${next}`);
  } catch {
    return fail("link_invalid");
  }
}
