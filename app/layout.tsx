import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { Suspense } from "react";

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
        {/* Applies the saved theme before first paint (no flash). It needs the
            per-request CSP nonce, which depends on request headers — isolated in
            its own Suspense boundary so the rest of the shell stays
            prerenderable under cacheComponents (same pattern the logged-in
            template uses for the session read). */}
        <Suspense fallback={null}>
          <ThemeInitScript />
        </Suspense>
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}

/**
 * Emits the inline theme-init script (see `@/lib/theme`) carrying this request's
 * CSP nonce, so it executes under the strict `script-src` policy. The nonce is
 * read from the `Content-Security-Policy` header the proxy sets on every page
 * request (see `proxy.ts`), so it's present in practice. If it were somehow
 * absent the script is still emitted but the CSP would block it, and an explicit
 * Light/Dark override wouldn't apply before paint — the "System" choice is
 * unaffected (it's pure CSS, see globals.css). Not a broken page, just a
 * possible flash for overridden themes.
 */
async function ThemeInitScript() {
  const nonce = extractNonce((await headers()).get("content-security-policy"));
  return (
    <script
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
    />
  );
}

/**
 * Pull the `script-src` nonce out of a CSP header value, or `undefined`.
 * Exported for direct unit testing.
 */
export function extractNonce(csp: string | null): string | undefined {
  return csp?.match(/'nonce-([^']+)'/)?.[1];
}
