import type { Metadata } from "next";
import { PublicBottomBar } from "@/components/MobileTabBar";
import { JsonLd } from "@/components/seo/JsonLd";
import { NGAP_FAQ, NGAP_FAQ_CURRENT, NGAP_FAQ_SOURCE } from "@/lib/public/ngap-faq";
import { faqPageSchema, openGraphFor, SITE_NAME, twitterFor, webPageSchema } from "@/lib/seo";

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
export default function NgapFaqPage() {
  return (
    <main className="public mobile-bar-space">
      <JsonLd
        data={[
          webPageSchema({
            path: "/faq",
            name: "NGAP WHS FAQ",
            description:
              "Frequently asked questions about the NGAP World Handicap System, in the NGAP's words, with the 2024 fees and dates it published.",
          }),
          faqPageSchema(NGAP_FAQ),
        ]}
      />
      <header className="public-head tl-pub-page-head">
        <p className="tl-pub-kicker">Handicaps</p>
        <h1 className="tl-pub-title">NGAP World Handicap System: frequently asked questions</h1>
        <p className="tl-pub-intro">
          The questions golfers ask about the NGAP&rsquo;s WHS, in the NGAP&rsquo;s words.
        </p>
      </header>

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
          <li key={item.id} className="card grid gap-2 [overflow-wrap:anywhere]">
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

      <PublicBottomBar />
    </main>
  );
}
