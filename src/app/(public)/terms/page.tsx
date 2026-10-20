import type { Metadata } from "next";
import { LegalPage } from "@/components/public/LegalPage";
import { termsMarkdown } from "@/content/legal/terms";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using TeeLine Golf at Iloilo Golf and Country Club.",
};

export default function TermsPage() {
  return <LegalPage markdown={termsMarkdown} />;
}
