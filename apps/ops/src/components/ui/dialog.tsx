"use client";

import { X } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

/** A centred dialog. Raised surface, a 1px line, no shadow stacks. */
export function DialogContent({
  title,
  description,
  className,
  children,
  ...props
}: ComponentProps<typeof RadixDialog.Content> & {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-[rgb(12_18_15/0.62)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <RadixDialog.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex max-h-[min(85vh,44rem)] w-[min(36rem,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border border-line bg-surface-raised p-5 text-ink outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <RadixDialog.Title className="font-display text-xl font-bold">
              {title}
            </RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="hint mt-0.5">
                {description}
              </RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close
            className="grid size-11 flex-none place-items-center rounded-md border border-line-strong text-ink hover:bg-surface-sunken"
            aria-label="Close"
          >
            <X className="size-4" />
          </RadixDialog.Close>
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
