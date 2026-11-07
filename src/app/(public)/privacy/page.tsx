import type { Metadata } from "next";
import { LegalPage } from "@/components/public/LegalPage";
import { privacyMarkdown } from "@/content/legal/privacy";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Iloilo Golf and Country Club handles personal data in TeeLine Golf.",
};

export default async function PrivacyPage() {
  const { t } = await getI18n();
  return <LegalPage markdown={privacyMarkdown} current="/privacy" label="Privacy policy" t={t} />;
}
