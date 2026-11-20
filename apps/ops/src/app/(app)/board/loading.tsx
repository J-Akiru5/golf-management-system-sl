import { Skeleton } from "@/components/ui/skeleton";

/** Shown while the board loads. Seven columns, so the page does not jump when the cards arrive. */
export default function BoardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="overline">Pipeline</p>
        <h1 className="mt-1 text-2xl">Tournament pipeline</h1>
      </div>

      <div className="-mx-3 flex gap-3 overflow-hidden px-3 sm:mx-0 sm:px-0">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="flex w-[272px] flex-none flex-col gap-2 sm:w-[288px]">
            <Skeleton className="h-5 w-28" />
            <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-sunken p-2">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
