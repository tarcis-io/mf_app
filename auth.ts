import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { validateEnv } from "@/env";

// Fail fast at server start if required secrets are missing, rather than
// surfacing a confusing error at the first sign-in. No-op during `next build`.
// See `@/env` and DEPLOYMENT.md.
validateEnv();

/**
 * Auth.js (NextAuth v5) configuration for MassFlow AI.
 *
 * Authentication is handled entirely within `mf_app` using Google as the sole
 * identity provider. There is no database adapter, so sessions are stateless
 * JWTs stored in an encrypted cookie.
 *
 * Required environment variables (see `.env.example`):
 *   - AUTH_SECRET        — used to encrypt the session cookie / JWT
 *   - AUTH_GOOGLE_ID     — Google OAuth client ID
 *   - AUTH_GOOGLE_SECRET — Google OAuth client secret
 *
 * `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are read automatically by the
 * Google provider from the environment, so they are not referenced here.
 */

/** The `authorized` callback's exact signature, derived from Auth.js config. */
type AuthorizedCallback = NonNullable<
  NonNullable<NextAuthConfig["callbacks"]>["authorized"]
>;

/**
 * Gatekeeper used by `proxy.ts` (see Next.js 16 proxy / middleware), run on
 * every matched request:
 *
 *   - On `/login`: authenticated users are redirected to the home page (they
 *     have no reason to see the login page); anonymous users may stay.
 *   - On every other matched route: a session is required. Returning `false`
 *     makes Auth.js redirect the visitor to the `signIn` page.
 *
 * Exported so it can be unit-tested directly (see `auth.test.ts`).
 */
export const authorized: AuthorizedCallback = ({ auth, request }) => {
  const isLoggedIn = Boolean(auth?.user);
  const isOnLogin = request.nextUrl.pathname === "/login";

  if (isOnLogin) {
    if (isLoggedIn) {
      return Response.redirect(new URL("/", request.nextUrl.origin));
    }
    return true;
  }

  return isLoggedIn;
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  // No database adapter is configured, so use stateless JWT sessions.
  session: { strategy: "jwt" },
  // Route unauthenticated users to our custom login page instead of the
  // Auth.js default page at `/api/auth/signin`.
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized,
  },
});
