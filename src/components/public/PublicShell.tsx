import type { ReactNode } from "react";

/**
 * The frame every public page shares.
 *
 * PLACEHOLDER. The public design builder is writing the real shell (the dark ground, the hairline
 * rules, the nav and the footer) on the same batch, in `src/components/public/PublicShell*` and
 * `public.css`. This version keeps the contract the pages need and nothing else: the `children`, an
 * optional `wide` flag, and the `tl-pub` ground the shared classes hang from. It is replaced at
 * merge; no page should depend on anything else here.
 */
export function PublicShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  /** Let the content run wider than the reading column. */
  wide?: boolean;
}) {
  return (
    <main className="tl-pub" data-wide={wide ? "true" : undefined}>
      {children}
    </main>
  );
}
