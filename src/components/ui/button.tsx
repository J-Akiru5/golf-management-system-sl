import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

/** Button from the design system. One `primary` per view; `gold` is the championship / publish action. */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border font-sans font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "border-transparent bg-primary text-on-primary hover:bg-primary-hover",
        secondary: "border-line-strong bg-transparent text-ink hover:bg-surface-sunken",
        ghost: "border-transparent bg-transparent text-ink hover:bg-surface-sunken",
        gold: "border-transparent bg-gold text-on-gold hover:bg-[#ebcb7e]",
        championship: "border-gold bg-gold-soft text-gold-ink hover:bg-gold hover:text-on-gold",
        danger: "border-transparent bg-danger text-on-danger hover:opacity-90",
        glass:
          "border-[rgba(238,240,234,0.25)] bg-[rgba(238,240,234,0.06)] text-ink hover:bg-[rgba(238,240,234,0.12)]",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-sm",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: props.type ?? "button" })}
      {...props}
    />
  );
}
