import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

/**
 * Fraction of the drawer's width a leftward drag must cross to dismiss it on
 * release; a shorter drag snaps back open. Keeps an accidental nudge from
 * closing the menu while still feeling responsive to a deliberate swipe.
 */
const DRAG_CLOSE_FRACTION = 1 / 3;

/** Pointer handlers the drawer element binds to wire up drag-to-close. */
interface DrawerDragHandlers {
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onPointerCancel: (event: ReactPointerEvent) => void;
}

interface DrawerDrag {
  /**
   * How far (px) the drawer is currently dragged left, or `null` when not being
   * dragged. While non-null the drawer should follow the finger with no
   * transition; on release it returns to `null` so the class-based transform
   * animates the snap-back or the close.
   */
  dragOffset: number | null;
  handlers: DrawerDragHandlers;
}

/**
 * Drag-to-close for the mobile navigation drawer. The drawer tracks a leftward
 * drag and dismisses (via `onClose`) if the pointer crosses
 * `DRAG_CLOSE_FRACTION` of its width; a shorter drag snaps back.
 *
 * Pointer events (not touch) so this works with any input that gets the
 * slide-over: a finger on a phone *and* a mouse in a narrow window — those are
 * the same layout, and a mouse fires no touch events. It's gated to the
 * slide-over state only: on `lg`+ the drawer is a static column and must not be
 * draggable. A press with no movement never crosses the threshold, so clicks on
 * the links/sign-out still fire.
 *
 * @param navRef   ref to the drawer element (its `offsetWidth` sets the threshold)
 * @param onClose  called when a drag passes the dismissal threshold
 */
export function useDrawerDragToClose(
  navRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): DrawerDrag {
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragStartXRef = useRef<number | null>(null);

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
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

  const onPointerMove = useCallback((event: ReactPointerEvent) => {
    if (dragStartXRef.current === null) return;
    // Clamp to ≤ 0: the drawer can be pulled left (toward closed) but not
    // dragged right past its open position.
    const delta = Math.min(0, event.clientX - dragStartXRef.current);
    setDragOffset(delta);
  }, []);

  const onPointerEnd = useCallback(() => {
    if (dragStartXRef.current === null) return;
    const delta = dragOffset ?? 0;
    const width = navRef.current?.offsetWidth ?? 0;
    dragStartXRef.current = null;
    // Return control to the class-based transform (which animates the result).
    setDragOffset(null);
    if (width > 0 && delta <= -width * DRAG_CLOSE_FRACTION) {
      onClose();
    }
  }, [dragOffset, navRef, onClose]);

  return {
    dragOffset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  };
}

/**
 * Behavior that applies only while the mobile drawer is open: close on Escape,
 * move focus into the drawer, lock scrolling on the page behind it, and return
 * focus to whatever was focused before (the menu button) on close. None of this
 * runs when `open` is false — on desktop the drawer is a static column, so the
 * shell leaves `open` false there.
 *
 * Moving focus in on open and restoring it on close is what makes the drawer
 * usable with a keyboard/screen reader: opening it drops the user into the nav,
 * and closing it (link click, Escape, backdrop, swipe) puts them back on the
 * trigger instead of at the top of the document.
 *
 * @param open     whether the mobile drawer is currently open
 * @param navRef   ref to the drawer element (receives focus on open)
 * @param onClose  called when Escape is pressed
 */
export function useDrawerDismissAndLock(
  open: boolean,
  navRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;

    // Remember the element focused before the drawer opened (the "Open menu"
    // button), so focus can be returned to it on close.
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    navRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      // Restore focus to the trigger, but only if it's still in the document
      // and focus hasn't already moved elsewhere (e.g. the user tabbed away
      // or the element was unmounted).
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [open, navRef, onClose]);
}
