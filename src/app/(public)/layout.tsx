import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "Player pairings", template: "%s | TeeLine Golf" },
};

export default function PublicLayout({ children }: { children: ReactNode }) {
  return children;
}
