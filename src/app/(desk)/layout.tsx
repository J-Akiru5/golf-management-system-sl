import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { ActivityProvider } from "@/lib/ui/activity";

export const metadata: Metadata = {
  title: { default: "Tournament office", template: "%s | TeeLine Golf" },
};

export default function DeskLayout({ children }: { children: ReactNode }) {
  return (
    <ActivityProvider>
      <AppShell>{children}</AppShell>
    </ActivityProvider>
  );
}
