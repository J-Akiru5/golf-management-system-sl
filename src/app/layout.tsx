import type { ReactNode } from "react";

export const metadata = { title: "IGCC Tournament Desk" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 24 }}>{children}</body>
    </html>
  );
}
