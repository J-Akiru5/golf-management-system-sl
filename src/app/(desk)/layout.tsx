import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { AppVersion } from "@/components/AppVersion";
import { DeskStatusStrip } from "@/components/DeskStatusStrip";
import { ActivityProvider } from "@/lib/ui/activity";

export const metadata: Metadata = {
  title: { default: "Tournament office", template: "%s | TeeLine Golf" },
};

export default function DeskLayout({ children }: { children: ReactNode }) {
  return (
    <ActivityProvider>
      <AppShell>
        {/* Session and data-state truth for every desk screen. */}
        <DeskStatusStrip />
        {children}
        <AppVersion className="py-6 text-center" />
      </AppShell>
    </ActivityProvider>
  );
}
