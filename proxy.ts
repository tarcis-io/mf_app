// Next.js 16 renamed `middleware.ts` to `proxy.ts` (and the `middleware`
// export to `proxy`). This runs the Auth.js `authorized` callback (see
// `@/auth`) on every matched request, redirecting unauthenticated visitors to
// the login page. Route protection is enabled by default: every route is
// guarded unless excluded by the `matcher` below.
export { auth as proxy } from "@/auth";

export const config = {
  /**
   * Run the proxy on all routes except:
   *   - `/api/auth/*`      — the Auth.js endpoints themselves (OAuth flow)
   *   - `/_next/static/*`  — build assets
   *   - `/_next/image/*`   — the image optimizer
   *   - static icon/metadata files (favicon, icons, logo, etc.)
   *
   * Everything else — pages and any future application API routes — requires
   * an authenticated session.
   */
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|icon.svg|icon.png|apple-icon.png|logo.svg).*)",
  ],
};
