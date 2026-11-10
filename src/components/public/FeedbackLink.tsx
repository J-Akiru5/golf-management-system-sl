"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/ui/cn";

/**
 * The public feedback link. It is in the public layout's footer, so it is reachable from every
 * public page without sign-in. The current path rides along as `?from=` so the organizer can see
 * which page a note is about; the page validates it again before it is stored.
 *
 * A `next/link` renders a real anchor in the server HTML, so the link works with JavaScript off.
 * Only the query string is built on the client.
 */
export function FeedbackLink({ className }: { className?: string }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const href =
    pathname && pathname !== "/feedback"
      ? `/feedback?from=${encodeURIComponent(pathname)}`
      : "/feedback";

  return (
    <Link
      href={href}
      className={cn("font-semibold text-gold-on-forest underline hover:text-white", className)}
    >
      {t("feedback.link")}
    </Link>
  );
}
