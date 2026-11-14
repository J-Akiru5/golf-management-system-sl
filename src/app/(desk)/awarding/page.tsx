import type { Metadata } from "next";
import { AwardingLanes } from "@/components/desk/AwardingLanes";

export const metadata: Metadata = { title: "Awarding lanes" };

/**
 * The desk's awarding screen: the six release lanes, one row each.
 *
 * The clock is rendered on the server so the countdown the desk reads is the same clock the public
 * pages count down with, not the desk laptop's.
 */
export default function AwardingPage() {
  return <AwardingLanes serverNow={new Date().toISOString()} />;
}
