interface UserLabelProps {
  /**
   * The signed-in user, as read from the session by the shell
   * (`LoggedInTemplate`). May be partial — `name`/`email` can be absent — so we
   * render defensively and show nothing when neither is present.
   */
  user?: { name?: string | null; email?: string | null } | null;
}

/**
 * The signed-in user's label for the header: their name, falling back to their
 * email. Presentational only — the session is read once by the shell and passed
 * in. Sign-out lives in the navigation drawer (see `AppShell`), not here.
 */
export default function UserLabel({ user }: UserLabelProps) {
  const label = user?.name ?? user?.email ?? undefined;

  if (!label) return null;

  return <span className="truncate">{label}</span>;
}
