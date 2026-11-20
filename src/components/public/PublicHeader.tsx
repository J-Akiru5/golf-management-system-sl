import Link from "next/link";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { TeeLineLogo } from "@/components/TeeLineLogo";

export function PublicHeader() {
  return (
    <header className="tl-pub-header no-print">
      <div className="tl-pub-header-inner">
        <Link href="/" className="tl-pub-brand" aria-label="TeeLine Golf home">
          <TeeLineLogo variant="reverse" width={156} />
        </Link>
        <PublicNavigation />
        <div className="tl-pub-header-actions">
          <Link className="tl-pub-sign-in" href="/login">
            Sign in
          </Link>
          <Link className="tl-button tl-button-light tl-pub-demo" href="/demo">
            Request a demo
          </Link>
        </div>
        <details className="tl-pub-mobile-menu">
          <summary aria-label="Open navigation menu">
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </summary>
          <div className="tl-pub-mobile-panel">
            <PublicNavigation />
            <Link href="/login">Sign in</Link>
            <Link className="tl-button tl-button-light" href="/demo">
              Request a demo
            </Link>
          </div>
        </details>
      </div>
    </header>
  );
}
