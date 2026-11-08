import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * The way back to the club's main public page, placed first in a public page header. The label comes
 * from the caller so a server page can pass its translated text without this component reading the
 * language itself. Hidden from print: a printed sheet has nowhere to go back to.
 */
export function PublicBackLink({ label, href = "/" }: { label: string; href?: string }) {
  return (
    <Link href={href} className="public-back no-print">
      <ArrowLeft className="size-4" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
