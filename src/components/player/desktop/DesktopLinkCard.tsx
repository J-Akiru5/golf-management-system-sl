import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

/**
 * One row in the desktop quick links.
 *
 * The icon repeats the label, so it is hidden from screen readers; the chevron is decoration for
 * the same reason. The whole row is the link, which keeps the tap target wide without a wrapper.
 */
export function DesktopLinkCard({
  href,
  label,
  hint,
  Icon,
}: {
  href: string;
  label: string;
  hint: string;
  Icon: LucideIcon;
}) {
  return (
    <li>
      <Link href={href} className="ph-quick-item no-underline">
        <span className="ph-quick-icon">
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        <span className="ph-quick-text">
          <b>{label}</b>
          <span className="ph-quick-hint">{hint}</span>
        </span>
        <ChevronRight className="ph-quick-go size-4" aria-hidden="true" />
      </Link>
    </li>
  );
}
