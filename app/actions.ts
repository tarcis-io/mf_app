"use server";

import { signOut } from "@/auth";

/**
 * Sign the current user out and return them to the login page.
 *
 * Lives in its own `"use server"` module (rather than inline in a component) so
 * it can be imported into the client-side app shell — the sign-out control
 * lives in the navigation drawer, which is a Client Component. A Server Action
 * imported this way is still executed on the server; the client only holds a
 * reference used as a `<form action>`.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
