import "@fontsource-variable/geist";
import "@fontsource-variable/manrope";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/bebas-neue";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { THEME_BOOT_SCRIPT } from "@/components/shell/theme-prefs";

export const metadata: Metadata = {
  // Internal only: no page here is for a search engine.
  robots: { index: false, follow: false },
  title: {
    default: "TeeLine Workspace",
    template: "%s | TeeLine Workspace",
  },
  description: "Internal workspace for Syntaxure Labs, MDM Events and ZenLabs.",
  applicationName: "TeeLine Workspace",
  icons: {
    icon: [{ url: "/brand/teeline-app-icon-forest.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#073d2e" },
    { media: "(prefers-color-scheme: dark)", color: "#171c19" },
  ],
};

/**
 * Every page reads the feature flag and, behind it, the caller's session. None of it may be baked
 * into a static page at build time, so the whole app renders per request.
 */
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Bundled inline, before the first paint, so a saved theme never flashes the other one. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
