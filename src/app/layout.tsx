import "@fontsource-variable/geist";
import "@fontsource-variable/manrope";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/bebas-neue";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import { DeskProvider } from "@/lib/store/desk-store";

export const metadata: Metadata = {
  title: {
    default: "Tournament office · Iloilo Golf & Country Club",
    template: "%s · Iloilo Golf & Country Club",
  },
  description: "Tournament desk for Iloilo Golf & Country Club, by Syntaxure Labs.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#183f30" },
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
        <DeskProvider>{children}</DeskProvider>
      </body>
    </html>
  );
}
