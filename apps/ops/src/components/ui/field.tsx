import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

/** Shared look for the text controls. The focus ring comes from the base layer. */
const FIELD =
  "w-full rounded-md border border-line-strong bg-surface-raised text-ink placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input data-slot="input" className={cn(FIELD, "h-11 px-3 text-sm", className)} {...props} />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(FIELD, "min-h-24 px-3 py-2.5 text-sm", className)}
      {...props}
    />
  );
}

/** A styled native select: a phone opens its own picker, which is the best control it has. */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(FIELD, "h-11 px-3 pr-8 text-sm", className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-[13px] font-medium text-ink", className)}
      {...props}
    />
  );
}
