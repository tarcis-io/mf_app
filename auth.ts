import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

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
    /**
     * Gatekeeper used by `proxy.ts` (see Next.js 16 proxy / middleware).
     * Returning `false` for a protected route makes Auth.js redirect the
     * visitor to the `signIn` page configured above.
     */
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const isOnLogin = request.nextUrl.pathname === "/login";

      if (isOnLogin) {
        // Already-authenticated users have no reason to see the login page;
        // send them to the home page. Anonymous users may stay.
        if (isLoggedIn) {
          return Response.redirect(new URL("/", request.nextUrl.origin));
        }
        return true;
      }

      // Every other matched route requires a session.
      return isLoggedIn;
    },
  },
});
