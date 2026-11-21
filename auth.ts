import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { isDevLoginEnabled, validateEnv } from "@/env";

// Fail fast at server start if required secrets are missing, rather than
// surfacing a confusing error at the first sign-in. No-op during `next build`.
// See `@/env` and DEPLOYMENT.md.
//
// This runs as an import side-effect, and this module is the import root for
// both the app and the proxy (`proxy.ts` imports from here), so this single
// call is what validates the environment in every server runtime — there is no
// separate hook in `proxy.ts`.
validateEnv();

/**
 * Auth.js (NextAuth v5) configuration for MassFlow AI.
 *
 * Authentication is handled entirely within `mf_app` using Google as the sole
 * identity provider. There is no database adapter, so sessions are stateless
 * JWTs stored in an encrypted cookie.
 *
 * The required environment variables are validated in `@/env` and documented
 * in DEPLOYMENT.md. The Google client ID/secret are read automatically from the
 * environment by the Google provider, so they are not referenced here.
 */

/** The `authorized` callback's exact signature, derived from Auth.js config. */
type AuthorizedCallback = NonNullable<
  NonNullable<NextAuthConfig["callbacks"]>["authorized"]
>;

/** The `session` callback's exact signature, derived from Auth.js config. */
type SessionCallback = NonNullable<
  NonNullable<NextAuthConfig["callbacks"]>["session"]
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

/**
 * Expose the Google account id (the OAuth `sub`) to the app as
 * `session.user.id`. With the JWT strategy Auth.js already stores the provider's
 * `sub` on `token.sub`, so this only copies it onto the session that Server
 * Components read via `auth()`.
 *
 * This id is what identifies the user to `mf_service`: it is sent as the
 * `X-User-Id` header (see `lib/mf-service.ts`), which scopes every batch to its
 * owner. Exported so it can be unit-tested directly (see `auth.test.ts`).
 *
 * `token.sub` is typed optional, so it's guarded; in practice Auth.js always
 * sets it for an authenticated JWT. `session.user.id` is typed via the module
 * augmentation in `types/next-auth.d.ts`.
 */
export const session: SessionCallback = ({ session, token }) => {
  if (token.sub) {
    session.user.id = token.sub;
  }
  return session;
};

/** The `jwt` callback's exact signature, derived from Auth.js config. */
type JwtCallback = NonNullable<NonNullable<NextAuthConfig["callbacks"]>["jwt"]>;

/**
 * Pin `token.sub` to the user id at sign-in. For the OAuth (Google) flow Auth.js
 * already sets `sub` to the provider's account id, but the Credentials provider
 * does not populate it reliably, so we copy it from the authenticated `user`
 * here. This keeps the `session` callback above provider-agnostic: it always has
 * a `token.sub` to surface as `session.user.id` (the `X-User-Id` for
 * `mf_service`). Exported for direct unit testing (see `auth.test.ts`).
 */
export const jwt: JwtCallback = ({ token, user }) => {
  if (user?.id) {
    token.sub = user.id;
  }
  return token;
};

/**
 * The fake identity returned by the dev-only Credentials login. Its `id` becomes
 * `session.user.id` (and thus the `X-User-Id` sent to `mf_service`), so it's a
 * stable, obviously-fake value.
 */
const DEV_USER = {
  id: "dev-user",
  name: "Dev User",
  email: "dev@massflow.local",
};

/**
 * Dev-only sign-in provider: one click logs you in as `DEV_USER`, with no
 * password and no external service, so the authenticated pages can be browsed
 * locally without Google OAuth. Only added to `providers` when
 * `isDevLoginEnabled()` is true (never in production — see `@/env`). `authorize`
 * ignores its input and always returns the same fake user.
 */
const devLoginProvider = Credentials({
  id: "dev-login",
  name: "Dev login",
  credentials: {},
  authorize: () => DEV_USER,
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Google is always available; the dev-only Credentials provider is appended
  // solely when explicitly enabled for local dev (see `isDevLoginEnabled`).
  providers: isDevLoginEnabled() ? [Google, devLoginProvider] : [Google],
  // No database adapter is configured, so use stateless JWT sessions.
  session: { strategy: "jwt" },
  // Route unauthenticated users to our custom login page instead of the
  // Auth.js default page at `/api/auth/signin`.
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized,
    jwt,
    session,
  },
});
