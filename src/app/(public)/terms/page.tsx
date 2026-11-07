import type { Metadata } from "next";
import { LegalPage } from "@/components/public/LegalPage";
import { termsMarkdown } from "@/content/legal/terms";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using TeeLine Golf at Iloilo Golf and Country Club.",
};

export default async function TermsPage() {
  const { t } = await getI18n();
  return <LegalPage markdown={termsMarkdown} current="/terms" label="Terms of service" t={t} />;
}
