import type { Metadata } from "next";
import { LegalPage } from "@/components/public/LegalPage";
import { termsMarkdown } from "@/content/legal/terms";
import { openGraphFor, SITE_NAME, twitterFor } from "@/lib/seo";

const TERMS_DESCRIPTION = "The terms for using TeeLine Golf at Iloilo Golf and Country Club.";

export const metadata: Metadata = {
  title: "Terms of service",
  description: TERMS_DESCRIPTION,
  alternates: { canonical: "/terms" },
  openGraph: openGraphFor({
    title: `Terms of service | ${SITE_NAME}`,
    description: TERMS_DESCRIPTION,
    path: "/terms",
  }),
  twitter: twitterFor({ title: `Terms of service | ${SITE_NAME}`, description: TERMS_DESCRIPTION }),
};

export default function TermsPage() {
  return <LegalPage markdown={termsMarkdown} />;
}
