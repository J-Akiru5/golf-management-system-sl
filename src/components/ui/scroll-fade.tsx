"use client";

import { type ComponentProps, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/ui/cn";

/**
 * A scrolling region that fades out at whichever edge has more content past it, instead of
 * cutting a card off at a hard line. The fade only shows where there is something to scroll to, so
 * a short list stays crisp. Keyboard users can focus the region and scroll it with the arrow keys.
 */
export function ScrollFade({
  className,
  children,
  ...props
}: ComponentProps<"div"> & { "aria-label": string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ top: false, bottom: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const top = el.scrollTop > 4;
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
      setEdge((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    // Content can grow (a panel expands) or the window can resize without a scroll event.
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="region"
      data-top={edge.top}
      data-bottom={edge.bottom}
      className={cn("scroll-fade", className)}
      {...props}
    >
      {children}
    </div>
  );
}
