"use server";

import { signIn, signOut } from "@/auth";
import { isDevLoginEnabled } from "@/env";

/**
 * The app's authentication Server Actions, kept together in one `"use server"`
 * module so both sides of the auth flow live in one discoverable, unit-testable
 * place.
 *
 * `signOutAction` in particular *must* live here rather than inline: its trigger
 * is in the navigation drawer, which is a Client Component, and a Server Action
 * can only be passed into client code by importing it from a `"use server"`
 * module. `signInAction` has no such constraint (the login page is a Server
 * Component), but is colocated here for symmetry and so it can be tested the
 * same way. Imported this way the actions still execute on the server; the
 * client only holds a reference used as a `<form action>`.
 */

/** Begin Google sign-in; on success, land the user on the home page. */
export async function signInAction(): Promise<void> {
  await signIn("google", { redirectTo: "/" });
}

/**
 * Dev-only: sign in as the fake `DEV_USER` via the Credentials provider (see
 * `@/auth`), landing on the home page — so the authenticated pages can be
 * browsed locally without Google. Guarded by `isDevLoginEnabled()` as
 * defense-in-depth: even if its trigger were somehow rendered outside dev, the
 * action refuses rather than signing anyone in. (The provider itself also isn't
 * registered unless dev login is enabled, so this would otherwise error.)
 */
export async function signInDevAction(): Promise<void> {
  if (!isDevLoginEnabled()) {
    throw new Error("Dev login is not enabled.");
  }
  await signIn("dev-login", { redirectTo: "/" });
}

/** Sign the current user out and return them to the login page. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
