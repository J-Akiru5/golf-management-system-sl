import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordField } from "@/components/auth/PasswordField";
import { resendConfirmation, signInWithPassword } from "@/lib/auth/actions";
import type { TranslationKey } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("auth.title") };
}

/**
 * Query-string codes mapped to dictionary keys. The codes come from the auth actions and the route
 * guards, so a redirect never prints a raw code on the page.
 */
const ERROR_KEYS: Record<string, TranslationKey> = {
  credentials_required: "auth.errors.credentialsRequired",
  sign_in_failed: "auth.errors.signInFailed",
  invalid_credentials: "auth.errors.invalidCredentials",
  email_not_confirmed: "auth.errors.emailNotConfirmed",
  rate_limited: "auth.errors.rateLimited",
  sign_in_disabled: "auth.errors.signInDisabled",
  email_required: "auth.errors.emailRequired",
  link_invalid: "auth.errors.linkInvalid",
  sign_in_required: "auth.errors.signInRequired",
  sign_up_credentials_required: "auth.errors.signUpRequired",
  sign_up_password_short: "auth.errors.passwordShort",
  sign_up_failed: "auth.errors.signUpFailed",
};

/** A code with no dictionary key yet. Kept in English rather than inventing a key. */
const ERROR_TEXT: Record<string, string> = {
  supabase_not_configured: "Supabase is not configured. The app is running in demo mode.",
};

const MESSAGE_KEYS: Record<string, TranslationKey> = {
  signed_out: "auth.messages.signedOut",
  check_email: "auth.messages.checkEmail",
  confirmation_sent: "auth.messages.confirmationSent",
  reset_sent: "auth.messages.resetSent",
  password_updated: "auth.messages.passwordUpdated",
};

/**
 * One sign-in page for both audiences, because an account's area is decided by what it is: a
 * club_members row opens the desk, a linked member record opens the player area. See
 * `landingFor()` in src/lib/auth/routes.ts for the rule.
 *
 * The form is built for a phone: one column, 16px fields so iOS does not zoom, and the submit
 * button pinned above the home indicator. A notice shares that pinned block, directly above the
 * button, so the button can never cover it.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const params = await searchParams;
  const { t } = await getI18n();
  const errorKey = params.error ? ERROR_KEYS[params.error] : undefined;
  const error = errorKey ? t(errorKey) : params.error ? ERROR_TEXT[params.error] : undefined;
  const messageKey = params.message ? MESSAGE_KEYS[params.message] : undefined;
  const message = messageKey ? t(messageKey) : undefined;
  const configured = isSupabaseConfigured();
  const next = params.next ?? "/";

  return (
    <AuthShell
      title={t("auth.title")}
      clubHomeLabel={t("auth.clubHome")}
      intro={
        <div className="grid gap-1.5">
          <p>{t("auth.intro")}</p>
          <p>
            {t("auth.pairingsLine")}{" "}
            <Link href="/pairings" className="font-semibold underline underline-offset-2">
              {t("auth.openPairings")}
            </Link>
          </p>
        </div>
      }
    >
      <div className="card grid gap-4 p-4 sm:p-5">
        <form action={signInWithPassword} className="grid gap-3">
          <input type="hidden" name="next" value={next} />

          <label className="field" htmlFor="email">
            <span>{t("auth.email")}</span>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              className="scroll-mb-24 text-[16px]"
              required
            />
          </label>

          <PasswordField
            id="password"
            name="password"
            label={t("auth.password")}
            autoComplete="current-password"
            enterKeyHint="go"
            showLabel={t("auth.show")}
            hideLabel={t("auth.hide")}
          />

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <label className="flex min-h-11 items-center gap-2.5 text-[13px]">
              <input type="checkbox" name="remember" />
              <span>{t("auth.remember")}</span>
            </label>
            <Link
              href="/forgot-password"
              className="inline-flex min-h-11 items-center text-[13px] font-semibold underline underline-offset-2"
            >
              {t("auth.forgot")}
            </Link>
          </div>

          <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-10 -mx-1 grid gap-2 rounded-xl bg-surface-raised/90 px-1 py-1.5 backdrop-blur-sm sm:static sm:mx-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            {error && (
              <p className="notice bad" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="notice ok" role="status">
                {message}
              </p>
            )}

            {/* The shared .btn is 44px; the submit keeps a full 48px for a thumb. */}
            <button type="submit" className="btn w-full" style={{ minHeight: 48 }}>
              {t("auth.signIn")}
            </button>
          </div>
        </form>

        {params.error === "email_not_confirmed" && (
          <form action={resendConfirmation} className="grid gap-2.5 border-t border-line pt-4">
            <p className="hint m-0">{t("auth.resendBody")}</p>
            <label className="field" htmlFor="resend-email">
              <span>{t("auth.email")}</span>
              <input
                id="resend-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="send"
                className="scroll-mb-24 text-[16px]"
                required
              />
            </label>
            <button type="submit" className="btn ghost">
              {t("auth.resend")}
            </button>
          </form>
        )}

        <p className="border-t border-line pt-4 text-[13px]">
          {t("auth.newHere")}{" "}
          <Link href="/signup" className="font-semibold underline underline-offset-2">
            {t("auth.createAccount")}
          </Link>
        </p>
      </div>

      {!configured && (
        <p className="hint">
          {t("auth.demoNote")}{" "}
          <Link href="/admin" className="font-semibold underline underline-offset-2">
            {t("auth.demoDesk")}
          </Link>
          .
        </p>
      )}

      <p className="hint text-center">
        By Syntaxure Labs.{" "}
        <Link href="/" className="font-semibold underline underline-offset-2">
          {t("auth.clubHome")}
        </Link>
      </p>
    </AuthShell>
  );
}
