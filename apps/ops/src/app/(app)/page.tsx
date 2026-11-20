import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="overline">Overview</p>
        <h1 className="mt-1 text-2xl">Your workspace at a glance</h1>
      </div>
      <EmptyState icon={LayoutDashboard} title="The overview is being built">
        My tasks, recent documents and a pipeline snapshot will appear here.
      </EmptyState>
    </div>
  );
}
