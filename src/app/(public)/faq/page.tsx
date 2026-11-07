import type { Metadata } from "next";
import Link from "next/link";
import { PlayerBottomBar } from "@/components/MobileTabBar";
import { PublicHeader } from "@/components/public/PublicHeader";
import { JsonLd } from "@/components/seo/JsonLd";
import { getI18n } from "@/lib/i18n/server";
import { NGAP_FAQ, NGAP_FAQ_CURRENT, NGAP_FAQ_SOURCE } from "@/lib/public/ngap-faq";
import { faqPageSchema, openGraphFor, SITE_NAME, twitterFor } from "@/lib/seo";

export const metadata: Metadata = {
  title: "NGAP WHS FAQ",
  description:
    "Frequently asked questions about the NGAP World Handicap System, in the NGAP's words, with the 2024 fees and dates it published.",
  alternates: { canonical: "/faq" },
  openGraph: openGraphFor({
    title: `NGAP WHS FAQ | ${SITE_NAME}`,
    description:
      "The NGAP's answers about the World Handicap System, in its own words, with the 2024 fees and dates it published.",
    path: "/faq",
  }),
  twitter: twitterFor({
    title: `NGAP WHS FAQ | ${SITE_NAME}`,
    description: "The NGAP's answers about the World Handicap System, in its own words.",
  }),
};

/**
 * The NGAP's WHS FAQs, published as a public page at the owner's request.
 *
 * The words are the NGAP's. The page says where they came from and links back to the NGAP for the
 * current position, because the fees and dates are the 2024 ones. Two defects in the source are
 * shown as notes on the questions they affect, not repaired.
 */
export default async function NgapFaqPage() {
  const { t } = await getI18n();
  return (
    <main className="public mobile-bar-space">
      <JsonLd data={faqPageSchema(NGAP_FAQ)} />
      <PublicHeader current="/faq" label="NGAP WHS FAQ" t={t} homeSection>
        <p className="overline mt-3">Handicaps</p>
        <h1 className="font-serif text-[28px] leading-8 font-semibold !text-on-forest sm:text-[44px] sm:leading-[48px]">
          NGAP World Handicap System: frequently asked questions
        </h1>
        <p className="text-on-forest-muted">
          The questions golfers ask about the NGAP&rsquo;s WHS, in the NGAP&rsquo;s words.
        </p>
      </PublicHeader>

      <section className="card grid gap-2" aria-labelledby="faq-source">
        <h2 id="faq-source" className="text-[18px]">
          Where this comes from
        </h2>
        <p className="m-0">{NGAP_FAQ_SOURCE}</p>
        <p className="m-0">
          {NGAP_FAQ_CURRENT}{" "}
          <a href="https://ngapwhs.com" target="_blank" rel="noopener noreferrer">
            ngapwhs.com
          </a>
          .
        </p>
      </section>

      <ol className="grid list-none gap-3 p-0">
        {NGAP_FAQ.map((item, index) => (
          <li key={item.id} className="card grid gap-2">
            <h2 className="text-[18px] leading-6">
              <span className="mr-1.5 text-ink-muted tnum">{index + 1}.</span>
              {item.question}
            </h2>
            {item.paragraphs.map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex} className="m-0">
                {paragraph}
              </p>
            ))}
            {item.bullets && item.bullets.length > 0 && (
              <ul className="m-0 grid list-disc gap-1.5 pl-5">
                {item.bullets.map((bullet, bulletIndex) => (
                  <li key={bulletIndex}>{bullet}</li>
                ))}
              </ul>
            )}
            {item.note && (
              <p className="notice m-0" role="note">
                {item.note}
              </p>
            )}
          </li>
        ))}
      </ol>

      <p className="hint no-print">
        <Link href="/">TeeLine Golf home</Link>
        {" · "}
        <Link href="/pairings">Player pairings</Link>
      </p>
      <PlayerBottomBar />
    </main>
  );
}
