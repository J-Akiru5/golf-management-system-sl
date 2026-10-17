import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { ActivityProvider } from "@/lib/ui/activity";

export default function DeskLayout({ children }: { children: ReactNode }) {
  return (
    <ActivityProvider>
      <AppShell>{children}</AppShell>
    </ActivityProvider>
  );
}
