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
        {/* Applies the saved theme before first paint (no flash). It's a static
            inline script authorized in the CSP by its SHA-256 hash (see
            `THEME_INIT_SCRIPT_HASH` and `proxy.ts`), so it needs no per-request
            nonce and can live in the statically prerendered shell — which is
            what keeps the CSP hash matching on prerendered / CDN-cached HTML. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
