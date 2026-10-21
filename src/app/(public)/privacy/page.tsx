import type { Metadata } from "next";
import { LegalPage } from "@/components/public/LegalPage";
import { privacyMarkdown } from "@/content/legal/privacy";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Iloilo Golf and Country Club handles personal data in TeeLine Golf.",
};

export default function PrivacyPage() {
  return <LegalPage markdown={privacyMarkdown} />;
}
