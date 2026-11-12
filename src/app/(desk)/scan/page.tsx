import type { Metadata } from "next";
import { DeskScanStation } from "@/components/scoring/ScanStation";

export const metadata: Metadata = {
  title: "Scan a card",
};

export default function ScanPage() {
  return <DeskScanStation />;
}
