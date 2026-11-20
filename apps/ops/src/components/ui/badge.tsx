import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

/** A small label. Tone carries a soft token pair, so the word stays readable in light and dark. */
export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-2 py-0.5 text-[11.5px] font-bold leading-none",
  {
    variants: {
      tone: {
        neutral: "bg-surface-sunken text-ink-muted",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
        info: "bg-info-soft text-info",
        gold: "bg-gold-soft text-gold-ink",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}
