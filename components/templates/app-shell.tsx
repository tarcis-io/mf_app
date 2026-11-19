"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { signOutAction } from "@/app/actions";

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

/**
 * Fraction of the drawer's width a leftward drag must cross to dismiss it on
 * release; a shorter drag snaps back open. Keeps an accidental nudge from
 * closing the menu while still feeling responsive to a deliberate swipe.
 */
const DRAG_CLOSE_FRACTION = 1 / 3;

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
  // How far (px) the drawer is currently dragged left, or null when not being
  // dragged. While non-null the drawer follows the finger with no transition;
  // on release it returns to null so the class-based transform animates the
  // snap-back or the close.
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const dragStartXRef = useRef<number | null>(null);

  const closeDrawer = useCallback(() => setMobileOpen(false), []);

  // Raise a shadow under the fixed header once the main region scrolls away
  // from the top. `main` is the scroll container (not the window), so the
  // signal is its `scrollTop`.
  const handleMainScroll = useCallback(
    (event: React.UIEvent<HTMLElement>) => {
      setScrolled(event.currentTarget.scrollTop > 0);
    },
    [],
  );

  // Drag-to-close. The drawer tracks a leftward drag and dismisses if the
  // pointer crosses DRAG_CLOSE_FRACTION of its width; a shorter drag snaps back.
  //
  // Pointer events (not touch) so this works with any input that gets the
  // slide-over: a finger on a phone *and* a mouse in a narrow window — those
  // are the same layout, and a mouse fires no touch events. It's gated to the
  // slide-over state only: on `lg`+ the drawer is a static column and must not
  // be draggable. A press with no movement never crosses the threshold, so
  // clicks on the links/sign-out still fire.
  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    // Primary button / primary pointer only, and only while the drawer is a
    // slide-over (below Tailwind's `lg`). `matchMedia` is guarded for
    // environments (e.g. older test DOMs) that don't implement it.
    if (!event.isPrimary || event.button !== 0) return;
    const isDesktop =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(min-width: 1024px)").matches;
    if (isDesktop) return;

    dragStartXRef.current = event.clientX;
    setDragOffset(0);
    // Keep receiving move/up even if the pointer leaves the drawer.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (dragStartXRef.current === null) return;
    // Clamp to ≤ 0: the drawer can be pulled left (toward closed) but not
    // dragged right past its open position.
    const delta = Math.min(0, event.clientX - dragStartXRef.current);
    setDragOffset(delta);
  }, []);

  const handlePointerEnd = useCallback(() => {
    if (dragStartXRef.current === null) return;
    const delta = dragOffset ?? 0;
    const width = navRef.current?.offsetWidth ?? 0;
    dragStartXRef.current = null;
    // Return control to the class-based transform (which animates the result).
    setDragOffset(null);
    if (width > 0 && delta <= -width * DRAG_CLOSE_FRACTION) {
      closeDrawer();
    }
  }, [dragOffset, closeDrawer]);

  // While the mobile drawer is open: close on Escape, move focus into the
  // drawer, and prevent the page behind from scrolling. None of this runs on
  // desktop, where the drawer is a static column.
  useEffect(() => {
    if (!mobileOpen) return;

    navRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKeyDown);

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [mobileOpen, closeDrawer]);

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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
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
        {/* Brand: logo + app name. */}
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
              data-testid="brand-logo"
              className="shrink-0"
            />
            <span className="text-base font-semibold tracking-tight">
              MassFlow <span className="text-sidebar-muted">AI</span>
            </span>
          </Link>
        </div>

        {/* Primary links. */}
        <ul className="flex flex-1 flex-col gap-1 px-3 py-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
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
