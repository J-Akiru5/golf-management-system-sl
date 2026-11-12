import type { Metadata } from "next";
import { StaffScanStation } from "@/components/scoring/ScanStation";

export const metadata: Metadata = {
  title: "Scan a card",
};

export default function StaffScanPage() {
  return <StaffScanStation />;
}
