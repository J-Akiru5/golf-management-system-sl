import { CheckSquare } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="overline">Tasks</p>
        <h1 className="mt-1 text-2xl">Team tasks</h1>
      </div>
      <EmptyState icon={CheckSquare} title="The task list is being built">
        Tasks with an owner, a due date and a priority, in a list and on a board.
      </EmptyState>
    </div>
  );
}
