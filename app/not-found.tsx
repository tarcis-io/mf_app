import ErrorPage from "@/components/error-page";

/**
 * Root 404 page, rendered by Next.js for unmatched routes and any `notFound()`
 * call. A Server Component — it has no interactivity of its own (the "Back to
 * home" link lives in the shared `ErrorPage`).
 *
 * Note: anonymous visitors to an unknown path are redirected to `/login` by the
 * proxy (see `proxy.ts`) before this renders, so in practice this is seen by
 * authenticated users and on any path excluded from the proxy matcher.
 */
export default function NotFound() {
  return (
    <ErrorPage code={404} message="We can't find the page you're looking for." />
  );
}
