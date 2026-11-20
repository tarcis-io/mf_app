import type { DefaultSession } from "next-auth";

/**
 * Module augmentation for Auth.js types.
 *
 * `session.user.id` carries the Google account id (the OAuth `sub`), populated
 * by the `session` callback in `@/auth`. It's typed here so Server Components
 * that read `auth()` get `user.id` as a `string` without a cast. The rest of
 * the user (name/email/image) comes from Auth.js's `DefaultSession`.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
