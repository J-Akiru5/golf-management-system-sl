"use client";

import { Tooltip as T } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export const TooltipProvider = T.Provider;

/** A short label on hover or focus. Never the only label: the trigger keeps its aria-label. */
export function Tip({
  label,
  side = "right",
  children,
  className,
}: {
  label: ReactNode;
  side?: ComponentProps<typeof T.Content>["side"];
  children: ReactNode;
  className?: string;
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={8}
          className={cn(
            "z-50 rounded-md bg-forest px-2.5 py-1.5 text-[12px] font-semibold text-on-forest shadow-lift animate-in fade-in-0 zoom-in-95",
            className,
          )}
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
