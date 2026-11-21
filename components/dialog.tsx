"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface DialogProps {
  /** Whether the dialog is shown. Controlled by the parent. */
  open: boolean;
  /**
   * Called when the dialog requests to close — a backdrop click, the Escape
   * key, or the native close. The parent flips its own `open` state to false in
   * response (the dialog never closes itself behind the parent's back).
   */
  onClose: () => void;
  /** Accessible title, rendered as the header `<h2>`. */
  title: ReactNode;
  /** The dialog body (form, confirmation copy, …), below the header. */
  children: ReactNode;
}

/**
 * A modal dialog built on the platform `<dialog>` element, shared by the
 * batches dialogs (new / edit / delete) so they behave identically. Opening it
 * with `showModal()` gives a backdrop, focus trapping, and Escape-to-close for
 * free; this component adds the two things that aren't automatic: closing on a
 * backdrop click, and keeping the parent's `open` state in sync when the
 * platform closes the dialog (Escape) so it can be reopened.
 *
 * Controlled: the parent owns `open` and reacts to `onClose`. Rendering the
 * children only while open means each feature dialog's form state is created
 * fresh on open and discarded on close — no stale values linger between opens.
 */
export default function Dialog({ open, onClose, title, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Drive the native element from the `open` prop. `showModal()`/`close()` are
  // idempotent-guarded against the element's current state so re-renders don't
  // re-open or double-close.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // When the platform closes the dialog (Escape, or a programmatic close),
  // notify the parent so its `open` state follows. Guards against calling
  // `onClose` when the parent already set `open` to false.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onNativeClose = () => {
      if (open) onClose();
    };
    dialog.addEventListener("close", onNativeClose);
    return () => dialog.removeEventListener("close", onNativeClose);
  }, [open, onClose]);

  // A click whose target is the <dialog> itself is a backdrop click (the
  // backdrop is a pseudo-element of the dialog under `showModal()`); a click on
  // the inner content is not. So this closes on the backdrop only.
  const onDialogClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={onDialogClick}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl bg-background p-0 text-foreground shadow-xl backdrop:bg-foreground/40"
    >
      {/* Inner wrapper: clicks here must NOT close (only backdrop clicks do),
          which holds because this element is not the <dialog> itself. */}
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-foreground/[.08] px-6 py-4">
          <h2
            id={titleId}
            className="text-base font-semibold tracking-tight text-foreground"
          >
            {title}
          </h2>
        </div>
        {children}
      </div>
    </dialog>
  );
}
