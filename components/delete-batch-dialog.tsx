"use client";

import { useCallback, useState, useTransition } from "react";

import { deleteBatchAction } from "@/app/batches/actions";
import Dialog from "@/components/dialog";
import type { EditableBatch } from "@/components/edit-batch-dialog";

interface DeleteBatchDialogProps {
  /** The batch to delete, or `null` when the dialog is closed. */
  batch: EditableBatch | null;
  /** Whether the dialog is shown. */
  open: boolean;
  /** Close without deleting (Cancel, backdrop, Escape). */
  onClose: () => void;
  /** Called after a successful delete (the list has been revalidated). */
  onDone: () => void;
}

/**
 * Confirmation dialog for deleting a batch. Controlled by the list (which owns
 * `open` and the target `batch`). The modal shell comes from the shared
 * `Dialog`; the delete runs server-side via `deleteBatchAction` (so `X-User-Id`
 * stays off the client).
 *
 * The copy names the batch so the user confirms the right one. The confirm
 * button is styled destructively. A failure surfaces in a banner and keeps the
 * dialog open; on success it closes and the list revalidates. Deleting a batch
 * that's already gone is treated as success by the action, so a stale row still
 * disappears.
 */
export default function DeleteBatchDialog({
  batch,
  open,
  onClose,
  onDone,
}: DeleteBatchDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onConfirm = useCallback(() => {
    if (!batch) return;
    startTransition(async () => {
      const result = await deleteBatchAction(batch.id);
      if (result.ok) {
        onDone();
      } else {
        setError(result.error ?? "Couldn't delete the batch. Please try again.");
      }
    });
  }, [batch, onDone]);

  // Clear any prior error when the dialog is (re)opened for a batch.
  const handleClose = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onClose={handleClose} title="Delete batch">
      <div className="flex flex-col gap-5 px-6 py-5">
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/[.08] px-3 py-2 text-sm text-danger-text"
          >
            {error}
          </p>
        ) : null}

        <p className="text-sm text-foreground/70">
          Delete{" "}
          <span className="font-medium text-foreground">
            {batch?.name ?? "this batch"}
          </span>
          ? This permanently removes the batch and its uploaded files. This
          can&apos;t be undone.
        </p>
      </div>

      <div className="flex justify-end gap-3 border-t border-foreground/[.08] px-6 py-4">
        <button
          type="button"
          onClick={handleClose}
          disabled={isPending}
          className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-foreground/15 px-4 text-sm font-medium text-foreground/80 outline-none transition-colors hover:border-foreground/25 hover:bg-foreground/[.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-danger-strong px-4 text-sm font-medium text-white outline-none transition-colors hover:bg-danger-text focus-visible:ring-2 focus-visible:ring-danger-strong disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
        >
          {isPending ? "Deleting…" : "Delete batch"}
        </button>
      </div>
    </Dialog>
  );
}
