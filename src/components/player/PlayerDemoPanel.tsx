import { ClipboardList, List, Map } from "lucide-react";
import Link from "next/link";
import type { Translate } from "@/lib/i18n/t";

/**
 * The player area without an account. The demo build has no session, so the three screens that
 * still have something real to show stay one tap away instead of leaving a notice on a blank page.
 */
export function PlayerDemoPanel({ t }: { t: Translate }) {
  const links = [
    { href: "/my/card", label: t("player.app.openCard"), Icon: ClipboardList },
    { href: "/my/course", label: t("player.app.openCourse"), Icon: Map },
    { href: "/pairings", label: t("player.app.openPairings"), Icon: List },
  ];

  return (
    <div className="grid gap-3">
      <p className="notice" role="status">
        {t("player.demo.body")}
      </p>
      <nav aria-label={t("player.app.tiles")} className="app-tiles">
        {links.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="app-tile no-underline">
            <Icon className="size-[18px]" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
