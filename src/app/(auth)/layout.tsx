import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/context";
import { getI18n } from "@/lib/i18n/server";

/**
 * The sign-in, sign-up and password pages share one language for the request, so the frame and the
 * client components inside it (the password show/hide control) agree with what the server rendered.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const { locale } = await getI18n();

  return (
    <div lang={locale}>
      <I18nProvider locale={locale}>{children}</I18nProvider>
    </div>
  );
}
