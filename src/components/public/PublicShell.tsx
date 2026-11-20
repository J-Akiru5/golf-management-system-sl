import type { ReactNode } from "react";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicHeader } from "@/components/public/PublicHeader";
import "@/components/public/public.css";

export function PublicShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="tl-public-layout">
      <PublicHeader />
      <div className={`tl-pub${wide ? " is-wide" : ""}`}>{children}</div>
      <PublicFooter />
    </div>
  );
}
