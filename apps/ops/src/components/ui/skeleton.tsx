import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

/** A placeholder for a block that is still loading. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-surface-sunken", className)}
      {...props}
    />
  );
}
