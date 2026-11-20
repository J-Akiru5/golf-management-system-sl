import Image from "next/image";
import Link from "next/link";
import { FeedbackLink } from "@/components/public/FeedbackLink";
import { TeeLineLogo } from "@/components/TeeLineLogo";
import { PARTNERS } from "@/lib/public/about";

export function PublicFooter() {
  return (
    <footer className="tl-pub-footer no-print">
      <div className="tl-pub-footer-inner">
        <div className="tl-pub-footer-brand">
          <Link href="/" aria-label="TeeLine Golf home">
            <TeeLineLogo variant="reverse" width={156} />
          </Link>
          <p>Golf tournament operations</p>
        </div>
        <nav className="tl-pub-partners" aria-label="The teams behind TeeLine">
          {PARTNERS.map((partner) => (
            <a
              key={partner.name}
              href={partner.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${partner.name} (opens in a new tab)`}
            >
              <Image
                src={partner.logo.src}
                alt=""
                width={partner.logo.width}
                height={partner.logo.height}
                sizes="96px"
                loading="lazy"
              />
              <span>{partner.name}</span>
            </a>
          ))}
        </nav>
        <nav className="tl-pub-footer-links" aria-label="Site information">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <FeedbackLink />
          <Link href="/login">Sign in</Link>
        </nav>
      </div>
      <p className="tl-pub-copyright">TeeLine Golf · Iloilo Golf and Country Club</p>
    </footer>
  );
}
