import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Shown while the document list is being read. */
export default function DocumentsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-56" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 w-36" />
        <Skeleton className="h-11 w-36" />
      </div>
      {[0, 1, 2].map((index) => (
        <Card key={index} className="flex flex-col gap-3 p-4">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-4 w-40" />
        </Card>
      ))}
    </div>
  );
}
