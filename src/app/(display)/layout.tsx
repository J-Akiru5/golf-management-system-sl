import type { ReactNode } from "react";

/** Display screens (clubhouse TV): no app chrome, black surround. */
export default function DisplayLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-black">{children}</div>;
}
