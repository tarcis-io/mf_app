import { auth, signOut } from "@/auth";

/**
 * Header control for authenticated pages: shows the signed-in user's name (or
 * email) and a sign-out button. Rendered inside `LoggedInTemplate`.
 *
 * This is a Server Component so it can read the session directly via `auth()`.
 * In practice the proxy (see `proxy.ts`) guarantees a session before any
 * logged-in page renders, but we render defensively and simply omit the name
 * if none is present.
 */
export default async function UserMenu() {
  const session = await auth();
  const user = session?.user;
  const label = user?.name ?? user?.email ?? undefined;

  return (
    <div className="flex items-center gap-4">
      {label ? (
        <span className="text-sm text-black/60" data-testid="user-label">
          {label}
        </span>
      ) : null}
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button
          type="submit"
          className="rounded-full border border-black/[.12] px-4 py-1.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04]"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
