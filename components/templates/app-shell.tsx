"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState, type ReactNode } from "react";

import { signOutAction } from "@/app/actions";
import {
  useDrawerDismissAndLock,
  useDrawerDragToClose,
} from "@/components/templates/app-shell.hooks";

/**
 * A single primary navigation entry. `href`/`label`/`icon` drive a `<Link>`;
 * active state is derived from the current pathname. Adding a page later is a
 * one-line addition to `NAV_ITEMS`.
 */
interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const HomeIcon = (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5 shrink-0"
  >
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
);

const SignOutIcon = (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5 shrink-0"
  >
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 17l-5-5 5-5" />
    <path d="M5 12h12" />
  </svg>
);

const MenuIcon = (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-6 w-6"
  >
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const NAV_ITEMS: NavItem[] = [{ href: "/", label: "Home", icon: HomeIcon }];

interface AppShellProps {
  /** The current page title, shown in the header. */
  title: string;
  /**
   * Session-dependent header content (the signed-in user's label), rendered on
   * the server and passed in so this Client Component never reads the session
   * itself. Optional — the header renders fine without it.
   */
  userLabel?: ReactNode;
  /** The page's own content, rendered inside the scrollable main region. */
  children: ReactNode;
}

/**
 * The interactive application shell for logged-in pages: a fixed top bar, a
 * scrollable main region, and a responsive navigation drawer (permanently open
 * on large screens, a slide-over on mobile).
 *
 * This is the one Client Component in the logged-in chrome — it owns the only
 * state that needs the browser: whether the mobile drawer is open, and whether
 * the main region has been scrolled (which raises a shadow under the header).
 * The server shell (`LoggedInTemplate`) stays a Server Component and passes the
 * session-derived bits in as props, so enabling interactivity here doesn't pull
 * the session read (or the page content) onto the client.
 */
export default function AppShell({ title, userLabel, children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  const closeDrawer = useCallback(() => setMobileOpen(false), []);

  // Drag-to-close gesture (slide-over only) and the open-drawer behaviors
  // (Escape to close, focus the drawer, lock background scroll) live in
  // dedicated hooks; the shell just wires them to its drawer state and element.
  const { dragOffset, handlers: dragHandlers } = useDrawerDragToClose(
    navRef,
    closeDrawer,
  );
  useDrawerDismissAndLock(mobileOpen, navRef, closeDrawer);

  // Raise a shadow under the fixed header once the main region scrolls away
  // from the top. `main` is the scroll container (not the window), so the
  // signal is its `scrollTop`.
  const handleMainScroll = useCallback(
    (event: React.UIEvent<HTMLElement>) => {
      setScrolled(event.currentTarget.scrollTop > 0);
    },
    [],
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Backdrop: only on mobile, only while open. Clicking it closes the
          drawer. Hidden from assistive tech (the drawer itself is the dialog). */}
      {mobileOpen ? (
        <div
          data-testid="drawer-backdrop"
          className="fixed inset-0 z-40 bg-foreground/40 lg:hidden motion-reduce:transition-none"
          aria-hidden="true"
          onClick={closeDrawer}
        />
      ) : null}

      {/* Navigation drawer. Static column on lg+, slide-over below it that can
          be dragged left to dismiss (see the pointer handlers). */}
      <nav
        ref={navRef}
        tabIndex={-1}
        aria-label="Primary"
        {...dragHandlers}
        // While dragging, follow the finger with no transition. Both `transform`
        // and `translate` are set inline so this wins over the Tailwind
        // translate utility regardless of which CSS property it compiles to; on
        // release the inline style is cleared and the class-based transform
        // animates the result.
        style={
          dragOffset !== null
            ? {
                transform: `translateX(${dragOffset}px)`,
                translate: "none",
                transition: "none",
              }
            : undefined
        }
        className={`fixed inset-y-0 left-0 z-50 flex w-64 touch-pan-y flex-col bg-sidebar text-sidebar-foreground outline-none transition-transform duration-200 ease-out motion-reduce:transition-none lg:static lg:z-auto lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <Link
            href="/"
            onClick={closeDrawer}
            className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Image
              src="/logo.svg"
              alt=""
              width={32}
              height={32}
              className="shrink-0"
            />
            <span className="text-base font-semibold tracking-tight">
              MassFlow <span className="text-sidebar-muted">AI</span>
            </span>
          </Link>
        </div>

        <ul className="flex flex-1 flex-col gap-1 px-3 py-2">
          {NAV_ITEMS.map((item) => {
            // A link is active on its own route and on any nested route beneath
            // it (e.g. `/batches` stays active on `/batches/123`). Root (`/`) is
            // special-cased to an exact match — every path is "beneath" `/`, so
            // a prefix test there would mark Home active everywhere.
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={closeDrawer}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none ${
                    active
                      ? "bg-primary text-background"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-hover hover:text-sidebar-foreground"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Sign out, pinned to the bottom and separated from the nav links —
            it's an action, not a destination. A Server Action form, so it works
            without client JS. */}
        <div className="border-t border-sidebar-border p-3">
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
            >
              {SignOutIcon}
              Sign out
            </button>
          </form>
        </div>
      </nav>

      {/* Right column: fixed header + scrollable main. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={`flex shrink-0 items-center gap-3 border-b border-foreground/[.08] bg-background px-4 py-4 transition-shadow sm:px-6 motion-reduce:transition-none ${
            scrolled ? "shadow-sm" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            className="-ml-1 rounded-md p-1 text-foreground outline-none hover:bg-foreground/[.04] focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
          >
            {MenuIcon}
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {userLabel ? (
            <div className="shrink-0 text-sm text-foreground/60">
              {userLabel}
            </div>
          ) : null}
        </header>

        <main
          onScroll={handleMainScroll}
          className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8"
        >
          <div className="text-lg leading-8 text-foreground/70">{children}</div>
        </main>
      </div>
    </div>
  );
}
