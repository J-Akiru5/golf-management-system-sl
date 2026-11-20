import { Settings } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="overline">Settings</p>
        <h1 className="mt-1 text-2xl">Your profile and the workspace</h1>
      </div>
      <EmptyState icon={Settings} title="Settings is being built">
        Your display name and theme live here, with the member list and roles for owners.
      </EmptyState>
    </div>
  );
}
