"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

/** A side drawer: the full menu on a phone, a side panel on a wide screen. */
export function SheetContent({
  side = "right",
  title,
  description,
  className,
  children,
  ...props
}: ComponentProps<typeof Dialog.Content> & {
  side?: "left" | "right";
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(12_18_15/0.62)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <Dialog.Content
        className={cn(
          "fixed inset-y-0 z-50 flex w-[min(420px,calc(100vw-24px))] flex-col gap-4 overflow-y-auto bg-surface p-4 text-ink outline-none data-[state=open]:animate-in data-[state=closed]:animate-out",
          side === "right"
            ? "right-0 border-l border-line data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
            : "left-0 border-r border-line data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <Dialog.Title className="font-display text-xl font-bold">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className="hint mt-0.5">{description}</Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">{title}</Dialog.Description>
            )}
          </div>
          <Dialog.Close
            className="grid size-11 flex-none place-items-center rounded-md border border-line-strong text-ink hover:bg-surface-sunken"
            aria-label="Close"
          >
            <X className="size-4" />
          </Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
