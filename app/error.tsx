"use client";

import ErrorPage from "@/components/error-page";

/**
 * Generic error boundary for the route tree, rendered by Next.js when a page or
 * nested segment throws while rendering. Must be a Client Component (Next's
 * `error.tsx` convention).
 *
 * Next passes `{ error, reset }` props, but this boundary uses neither: the
 * recovery action is a plain navigation "Back to home" (in the shared
 * `ErrorPage`), not `reset()` — a full navigation to `/` is a more reliable way
 * out of a broken state than re-rendering the same failed segment in place — and
 * the message is intentionally generic rather than echoing the error. The props
 * are therefore left undeclared. (`error` is still reported to Next's own error
 * logging regardless.)
 *
 * This boundary does not catch errors thrown by the root `app/layout.tsx`
 * itself; a `global-error.tsx` would be needed for that (not added here).
 */
export default function Error() {
  return (
    <ErrorPage
      code={500}
      message="Something went wrong on our end. We're working to fix it."
    />
  );
}
