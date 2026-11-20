import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

/**
 * Button from the design system. One `primary` per view. `danger` is for the destructive action
 * only. Every size is at least 36px tall and the default is 44px, so a phone target is comfortable.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border font-sans font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "border-transparent bg-primary text-on-primary hover:bg-primary-hover",
        secondary: "border-line-strong bg-transparent text-ink hover:bg-surface-sunken",
        ghost: "border-transparent bg-transparent text-ink hover:bg-surface-sunken",
        danger: "border-transparent bg-danger text-on-danger hover:opacity-90",
      },
      size: {
        sm: "h-9 px-3 text-[13px]",
        md: "h-11 px-4 text-sm",
        icon: "size-11",
        "icon-sm": "size-9",
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
