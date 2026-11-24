import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-info";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

export const viewport: Viewport = {
  // `color-scheme` is set per-theme in globals.css (it flips with light/dark),
  // so it isn't pinned here. `themeColor` stays the brand orange for both.
  themeColor: "#f97316",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // `suppressHydrationWarning`: the theme-init script sets `data-theme` on
    // <html> before React hydrates, so the server-rendered markup (no attribute)
    // and the client DOM can differ on this one element by design.
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved theme before first paint (no flash). A static
            inline script, allowed by the CSP's `script-src 'unsafe-inline'`
            (see next.config.ts) — no nonce needed, so it can live in the
            statically prerendered shell. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
