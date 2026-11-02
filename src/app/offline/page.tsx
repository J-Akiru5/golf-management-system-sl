import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { OfflinePlayerView } from "@/components/player/OfflinePlayerView";
import { TeeLineLogo } from "@/components/TeeLineLogo";

export const metadata: Metadata = { title: "No connection" };

/**
 * The page the service worker serves when a screen was never opened on this phone. It is static,
 * so it works with no server, and it reads the last saved player entry from the phone when one
 * exists. It is deliberately outside the desk and player shells: neither should claim to be live.
 */
export default function OfflinePage() {
  return (
    <main className="public">
      <header className="band flex items-center justify-between gap-4 rounded-[20px] px-4 py-3">
        <Link href="/" className="flex items-center no-underline">
          <TeeLineLogo variant="reverse" width={172} />
        </Link>
        <span className="text-[13px] text-on-forest-muted">No connection</span>
      </header>

      <section className="card grid gap-3" aria-labelledby="offline-h">
        <p className="overline flex items-center gap-2">
          <WifiOff className="size-4" aria-hidden="true" />
          Offline
        </p>
        <h1 id="offline-h" className="font-serif text-[30px] leading-9 font-semibold">
          This phone has no signal
        </h1>
        <p className="hint m-0">
          Nothing is being sent or received. Pages you opened before are kept on this phone, and
          anything they show is the copy from the time named on the page. Changes cannot be saved
          until the connection returns.
        </p>
        <p className="hint m-0">
          <Link href="/">Club home</Link> · <Link href="/pairings">Published pairings</Link> ·{" "}
          <Link href="/my">My golf</Link>
        </p>
      </section>

      <section className="grid gap-3" aria-labelledby="saved-h">
        <h2 id="saved-h" className="text-[18px]">
          Your last saved entry
        </h2>
        <OfflinePlayerView />
      </section>
    </main>
  );
}
