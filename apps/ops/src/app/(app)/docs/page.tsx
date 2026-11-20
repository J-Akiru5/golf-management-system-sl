import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="overline">Documents</p>
        <h1 className="mt-1 text-2xl">Shared documents</h1>
      </div>
      <EmptyState icon={FileText} title="The document list is being built">
        Create, rename, archive and search live documents here. The editor arrives with it.
      </EmptyState>
    </div>
  );
}
