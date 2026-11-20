import { SquareKanban } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Pipeline" };

export default function PipelinePage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="overline">Pipeline</p>
        <h1 className="mt-1 text-2xl">Tournament pipeline</h1>
      </div>
      <EmptyState icon={SquareKanban} title="The pipeline board is being built">
        Inquiry to invoiced, seven stages, with each card linked to its tournament.
      </EmptyState>
    </div>
  );
}
