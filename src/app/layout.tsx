import "@fontsource-variable/newsreader";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import { DeskProvider } from "@/lib/store/desk-store";

export const metadata: Metadata = {
  title: "Starter",
  description: "Tournament desk for Iloilo Golf & Country Club, by Syntaxure Labs.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

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
