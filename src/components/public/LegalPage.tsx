import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PublicHeader } from "@/components/public/PublicHeader";
import type { Translate } from "@/lib/i18n/t";

/**
 * One of the legal pages.
 *
 * The copy lives as markdown so the club's adviser can correct it without touching JSX. React
 * Markdown emits React elements rather than an HTML string, so nothing here is injected raw. The
 * header is the same one every public page wears, on the full-width band these documents keep.
 */
export function LegalPage({
  markdown,
  current,
  label,
  t,
}: {
  markdown: string;
  current: string;
  label: string;
  t: Translate;
}) {
  return (
    <div className="legal-page">
      <div className="legal-head">
        <PublicHeader current={current} label={label} t={t} homeSection />
      </div>

      <main className="legal-body">
        <article className="legal-prose">
          <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
        </article>
      </main>
    </div>
  );
}
