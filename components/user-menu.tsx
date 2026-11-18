import { signOut } from "@/auth";

interface UserMenuProps {
  /**
   * The signed-in user, as read from the session by the parent shell
   * (`LoggedInTemplate`). May be partial — `name`/`email` can be absent — so
   * we render defensively and omit the label when neither is present.
   */
  user?: { name?: string | null; email?: string | null } | null;
}

/**
 * Header control for authenticated pages: shows the signed-in user's name (or
 * email) and a sign-out button. Rendered inside `LoggedInTemplate`, which reads
 * the session once and passes the user down — so this stays a presentational
 * component with no session read of its own.
 */
export default function UserMenu({ user }: UserMenuProps) {
  const label = user?.name ?? user?.email ?? undefined;

  return (
    <div className="flex items-center gap-4">
      {label ? (
        <span className="text-sm text-foreground/60" data-testid="user-label">
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
          className="rounded-full border border-foreground/[.12] px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[.04]"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
