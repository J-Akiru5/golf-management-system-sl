import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OnboardingGate } from "@/components/onboarding";
import { StaffShell } from "@/components/staff/StaffShell";

export const metadata: Metadata = {
  title: { default: "Staff", template: "%s | TeeLine Staff" },
};

/**
 * The staff area's own layout. It deliberately does not use `AppShell`: no rail, no print centre,
 * no status strip. A volunteer's phone gets the four things the staff app is for.
 */
export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <StaffShell>
      {children}
      <OnboardingGate role="staff" />
    </StaffShell>
  );
}
