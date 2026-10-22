import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Entry links are per-event and mostly a form, so they are crawled (to see this directive) but never
 * indexed. The decision is recorded in the plan: the site keeps a small, durable index.
 */
export const metadata: Metadata = {
  title: "Enter the tournament",
  robots: { index: false, follow: false, nocache: true },
};

export default function EnterLayout({ children }: { children: ReactNode }) {
  return children;
}
