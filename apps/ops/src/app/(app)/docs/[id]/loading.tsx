import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a document and its version history are being read. */
export default function DocumentLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-11 w-40" />
      <Skeleton className="h-12 w-2/3" />
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="ml-auto h-9 w-32" />
      </div>
      <Skeleton className="h-12 w-full" />
      <Card className="flex flex-col gap-3 p-4">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-5/6" />
        <Skeleton className="h-5 w-2/3" />
      </Card>
    </div>
  );
}
