"use client";

import { useCallback, useId, useRef, useState, useTransition } from "react";

import { renameBatchAction } from "@/app/batches/actions";
import Dialog from "@/components/dialog";

/** The batch being edited — only the id (to target the endpoint) and current name. */
export interface EditableBatch {
  id: string;
  name: string;
}

interface EditBatchDialogProps {
  /** The batch to rename, or `null` when the dialog is closed. */
  batch: EditableBatch | null;
  /** Whether the dialog is shown. */
  open: boolean;
  /** Close without saving (Cancel, backdrop, Escape). */
  onClose: () => void;
  /** Called after a successful rename (the list has been revalidated). */
  onDone: () => void;
}

/**
 * Dialog to rename a batch — the only editable field is the name. Controlled by
 * the list (which owns `open` and the target `batch`). The modal shell comes
 * from the shared `Dialog`; the rename runs server-side via `renameBatchAction`
 * (so `X-User-Id` stays off the client).
 *
 * The name is prefilled and required; a duplicate name (or any other failure)
 * surfaces in a single banner and the dialog stays open so the user can adjust.
 * On success it closes and the list revalidates. The form is keyed on the batch
 * id so switching which row is edited resets the field.
 */
export default function EditBatchDialog({
  batch,
  open,
  onClose,
  onDone,
}: EditBatchDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Edit batch">
      {batch ? (
        <EditBatchForm
          key={batch.id}
          batch={batch}
          onCancel={onClose}
          onDone={onDone}
        />
      ) : null}
    </Dialog>
  );
}

function EditBatchForm({
  batch,
  onCancel,
  onDone,
}: {
  batch: EditableBatch;
  onCancel: () => void;
  onDone: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(batch.name);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const errorId = useId();

  const trimmed = name.trim();
  // Submittable when there's a non-empty name that actually differs from the
  // current one (renaming to the same value is a no-op worth preventing).
  const canSubmit = trimmed !== "" && trimmed !== batch.name && !isPending;

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!formRef.current || !canSubmit) return;
      const formData = new FormData(formRef.current);
      startTransition(async () => {
        const result = await renameBatchAction(batch.id, formData);
        if (result.ok) {
          onDone();
        } else {
          setError(
            result.error ?? "Couldn't rename the batch. Please try again.",
          );
        }
      });
    },
    [batch.id, canSubmit, onDone],
  );

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex min-h-0 flex-col">
      <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
        {error ? (
          <p
            id={errorId}
            role="alert"
            className="rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/[.08] px-3 py-2 text-sm text-[#b91c1c]"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={nameId}
            className="text-sm font-medium text-foreground"
          >
            Name
          </label>
          <input
            id={nameId}
            name="name"
            type="text"
            required
            autoFocus
            value={name}
            // Associate the field with the error banner when one is shown, so
            // assistive tech ties the message to this input (the banner also has
            // role="alert", which announces it on appearance).
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setError(null);
              setName(event.target.value);
            }}
            className="h-10 w-full rounded-lg border border-foreground/15 bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/40 hover:border-foreground/25 focus-visible:border-foreground/25 focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-foreground/[.08] px-6 py-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-foreground/15 px-4 text-sm font-medium text-foreground/80 outline-none transition-colors hover:border-foreground/25 hover:bg-foreground/[.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-background outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
        >
          {isPending ? "Saving…" : "Edit batch"}
        </button>
      </div>
    </form>
  );
}
