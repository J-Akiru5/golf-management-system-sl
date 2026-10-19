import "@fontsource-variable/geist";
import "@fontsource-variable/manrope";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/bebas-neue";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { OfflineRuntime } from "@/components/OfflineRuntime";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import { DeskProvider } from "@/lib/store/desk-store";

export const metadata: Metadata = {
  title: {
    default: "TeeLine Golf | Every round, beautifully organized",
    template: "%s | TeeLine Golf",
  },
  description:
    "A clearer way to manage golf tournaments, player registrations, and the moments that bring the club together.",
  applicationName: "TeeLine Golf",
  openGraph: {
    type: "website",
    siteName: "TeeLine Golf",
    title: "TeeLine Golf | Every round, beautifully organized",
    description:
      "A clearer way to manage golf tournaments, player registrations, and the moments that bring the club together.",
  },
  icons: {
    icon: [
      { url: "/brand/teeline-app-icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "TeeLine",
    statusBarStyle: "default",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
      </head>
      <body>
        <OfflineRuntime />
        <DeskProvider>{children}</DeskProvider>
      </body>
    </html>
  );
}
