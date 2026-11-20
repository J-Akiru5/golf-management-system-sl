import type { Metadata } from "next";
import { LegalPage } from "@/components/public/LegalPage";
import { privacyMarkdown } from "@/content/legal/privacy";
import { openGraphFor, SITE_NAME, twitterFor } from "@/lib/seo";

const PRIVACY_DESCRIPTION =
  "How Iloilo Golf and Country Club handles personal data in TeeLine Golf.";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: PRIVACY_DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: openGraphFor({
    title: `Privacy policy | ${SITE_NAME}`,
    description: PRIVACY_DESCRIPTION,
    path: "/privacy",
  }),
  twitter: twitterFor({ title: `Privacy policy | ${SITE_NAME}`, description: PRIVACY_DESCRIPTION }),
};

export default function PrivacyPage() {
  return <LegalPage markdown={privacyMarkdown} />;
}
