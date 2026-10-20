import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TeeLineLogo } from "@/components/TeeLineLogo";

/**
 * One of the legal drafts.
 *
 * The copy lives as markdown so the club's adviser can correct it without touching JSX, and it is
 * regenerated into `src/content/legal` by `scripts/gen-legal.mjs`. React Markdown emits React
 * elements rather than an HTML string, so nothing here is injected raw. The draft warning is the
 * blockquote at the top of each document, which keeps it in one place rather than two that can drift
 * apart.
 */
export function LegalPage({ markdown }: { markdown: string }) {
  return (
    <div className="legal-page">
      <header className="legal-head">
        <Link href="/" aria-label="TeeLine Golf home">
          <TeeLineLogo variant="reverse" width={172} />
        </Link>
        <Link className="legal-back" href="/">
          Back to TeeLine
        </Link>
      </header>

      <main className="legal-body">
        <article className="legal-prose">
          <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
        </article>
      </main>
    </div>
  );
}
