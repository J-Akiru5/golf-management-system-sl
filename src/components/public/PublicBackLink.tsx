"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { isPairingsBack } from "@/lib/public/back-link";

/**
 * The way back to the club's main public page, placed first in a public page header. The label comes
 * from the caller so a server page can pass its translated text without this component reading the
 * language itself. Hidden from print: a printed sheet has nowhere to go back to.
 *
 * When `pairingsLabel` is given, the link checks the referrer after hydration. A page opened from
 * `/pairings` returns to the pairings view and uses that label; a direct visit keeps the default.
 */
export function PublicBackLink({
  label,
  href = "/",
  pairingsLabel,
  pairingsHref = "/pairings",
}: {
  label: string;
  href?: string;
  pairingsLabel?: string;
  pairingsHref?: string;
}) {
  const [target, setTarget] = useState({ href, label });

  useEffect(() => {
    if (!pairingsLabel) return;
    if (isPairingsBack(window.location.search, document.referrer, window.location.origin)) {
      setTarget({ href: pairingsHref, label: pairingsLabel });
    }
  }, [href, label, pairingsHref, pairingsLabel]);

  return (
    <Link href={target.href} className="public-back no-print">
      <ArrowLeft className="size-4" aria-hidden="true" />
      <span>{target.label}</span>
    </Link>
  );
}
