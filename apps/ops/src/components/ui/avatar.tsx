import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";
import { initials, toneFor } from "./avatar-initials";

const SIZES = {
  sm: "size-8 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-11 text-sm",
} as const;

export function Avatar({
  id,
  name,
  size = "md",
  className,
  ...props
}: Omit<ComponentProps<"span">, "children"> & {
  id: string;
  name: string;
  size?: keyof typeof SIZES;
}) {
  return (
    <span
      data-slot="avatar"
      // The name is always rendered as text next to the avatar, so the mark itself is decorative.
      aria-hidden="true"
      className={cn(
        "inline-grid flex-none select-none place-items-center rounded-full font-display font-extrabold",
        SIZES[size],
        toneFor(id),
        className,
      )}
      {...props}
    >
      {initials(name)}
    </span>
  );
}
