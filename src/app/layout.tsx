import "@fontsource-variable/geist";
import "@fontsource-variable/manrope";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/bebas-neue";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { OfflineRuntime } from "@/components/OfflineRuntime";
import { JsonLd } from "@/components/seo/JsonLd";
import { THEME_INIT_SCRIPT, ThemeSync } from "@/components/ThemeToggle";
import { ToastProvider } from "@/components/ui/toast";
import {
  COMPANY,
  openGraphFor,
  organizationSchema,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  siteVerification,
  twitterFor,
  websiteSchema,
} from "@/lib/seo";
import { DeskProvider } from "@/lib/store/desk-store";
import { RAIL_INIT_SCRIPT } from "@/lib/ui/rail";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "Sports",
  keywords: [
    "golf tournament management",
    "golf tournament software",
    "golf club software Philippines",
    "tournament pairings",
    "golf handicaps",
  ],
  authors: [{ name: COMPANY.name, url: COMPANY.url }],
  creator: COMPANY.name,
  publisher: COMPANY.name,
  // The engine's own token, from the deployment's environment. Omitted when it is unset, so a
  // checkout without it builds a site with no verification tag rather than an empty one.
  verification: siteVerification(),
  openGraph: openGraphFor({
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    path: "/",
  }),
  twitter: twitterFor({
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  }),
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/brand/teeline-app-icon-forest.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "TeeLine",
    // The player header is forest; a translucent status bar blends it into the app
    // instead of leaving a white strip above a dark header.
    statusBarStyle: "black-translucent",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Without this, env(safe-area-inset-*) is always zero and the bottom bar
  // cannot fill the home-indicator area on an installed iPhone app.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#073d2e" },
    { media: "(prefers-color-scheme: dark)", color: "#171c19" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: RAIL_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeSync />
        <JsonLd data={[organizationSchema(), websiteSchema()]} />
        <OfflineRuntime />
        <ToastProvider>
          <DeskProvider>{children}</DeskProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
