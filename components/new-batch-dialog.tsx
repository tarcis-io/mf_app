"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";

import { createBatchAction } from "@/app/batches/actions";
import {
  BATCH_FILE_FIELDS,
  type BatchFileKey,
} from "@/lib/mf-service";

/**
 * Friendly labels for the file inputs, keyed by {@link BatchFileKey}. The field
 * names in `BATCH_FILE_FIELDS` are the wire contract (technical); these are what
 * the user reads. Exhaustive by type, so a new required file won't compile until
 * it's labelled.
 */
const FILE_LABELS: Record<BatchFileKey, string> = {
  mzmine_annotations: "Annotations",
  mzmine_full_feature_table: "Full feature table",
  mzmine_metadata: "Metadata",
  gnps_feature_table_reformated: "Feature table (reformatted)",
  gnps_merged_results: "Merged results",
};

/** The two file groups, as cards, in display order with their headings. */
const GROUPS = [
  { id: "mzmine", title: "MZmine files" },
  { id: "gnps", title: "GNPS files" },
] as const;

/** Does a chosen filename end with the field's expected extension (e.g. `.csv`)? */
function hasExpectedExtension(filename: string, accept: string): boolean {
  return filename.toLowerCase().endsWith(accept.toLowerCase());
}

/**
 * The "New batch" trigger button plus the modal dialog that creates a batch.
 *
 * A Client Component: it owns the form state, the open/close of a native
 * `<dialog>`, and client-side validation. The actual upload runs server-side
 * via `createBatchAction` (so the `mf_service` URL and the per-user header never
 * reach the browser).
 *
 * The dialog uses the platform `<dialog>` element opened with `showModal()`, so
 * it gets a backdrop, focus trapping, and Escape-to-close for free. Clicking the
 * backdrop also closes it (handled below). Fields — a required Name plus the
 * five required files grouped into an MZmine card (3) and a GNPS card (2) — are
 * all mandatory, and each file must carry its expected extension before the
 * form can submit. Server errors (a duplicate name, a rejected upload, a network
 * failure) surface in a single banner at the top; on success the dialog closes,
 * resets, and the list revalidates so the new `creating` batch appears.
 */
export default function NewBatchDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Bumped on each reset to remount the uncontrolled form (clears file inputs,
  // which can't be cleared by setting value).
  const [formKey, setFormKey] = useState(0);
  // Mirrors which files are chosen + valid, to drive the submit button's enabled
  // state and the per-field hint. Keyed by BatchFileKey.
  const [fileState, setFileState] = useState<
    Partial<Record<BatchFileKey, { name: string; valid: boolean }>>
  >({});
  const [name, setName] = useState("");

  const errorId = useId();

  const resetForm = useCallback(() => {
    setError(null);
    setName("");
    setFileState({});
    setFormKey((k) => k + 1);
  }, []);

  const open = useCallback(() => {
    resetForm();
    dialogRef.current?.showModal();
  }, [resetForm]);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  // Clear state whenever the dialog closes (via Cancel, Escape, backdrop, or a
  // successful submit), so the next open starts fresh. The native `close` event
  // fires for all of those.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => resetForm();
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [resetForm]);

  // Close when the backdrop is clicked. With `showModal()` the backdrop is a
  // pseudo-element of the dialog, so a click on it has the <dialog> itself as
  // its target; a click on the inner content does not. Comparing against the
  // dialog element distinguishes the two.
  const onDialogClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (event.target === dialogRef.current) close();
    },
    [close],
  );

  const onFileChange = useCallback(
    (key: BatchFileKey, accept: string, file: File | undefined) => {
      setError(null);
      setFileState((prev) => {
        const next = { ...prev };
        if (!file) {
          delete next[key];
        } else {
          next[key] = {
            name: file.name,
            valid: hasExpectedExtension(file.name, accept),
          };
        }
        return next;
      });
    },
    [],
  );

  // The form is submittable only when the name is non-empty and every required
  // file is both chosen and has a valid extension.
  const allFilesValid = BATCH_FILE_FIELDS.every(
    (f) => fileState[f.key]?.valid === true,
  );
  const canSubmit = name.trim() !== "" && allFilesValid && !isPending;

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!formRef.current || !canSubmit) return;
      const formData = new FormData(formRef.current);
      startTransition(async () => {
        const result = await createBatchAction(formData);
        if (result.ok) {
          close();
        } else {
          setError(result.error ?? "Couldn't create the batch. Please try again.");
        }
      });
    },
    [canSubmit, close],
  );

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-background outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
      >
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
        New
      </button>

      <dialog
        ref={dialogRef}
        onClick={onDialogClick}
        aria-labelledby={`${errorId}-title`}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl bg-background p-0 text-foreground shadow-xl backdrop:bg-foreground/40"
      >
        {/* Inner wrapper: clicks here must NOT close (only backdrop clicks do),
            which works because this element is not the <dialog> itself. */}
        <form
          ref={formRef}
          key={formKey}
          onSubmit={onSubmit}
          className="flex max-h-[85vh] flex-col"
        >
          <div className="flex items-center justify-between gap-3 border-b border-foreground/[.08] px-6 py-4">
            <h2
              id={`${errorId}-title`}
              className="text-base font-semibold tracking-tight text-foreground"
            >
              New batch
            </h2>
          </div>

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

            <NameField value={name} onChange={setName} />

            {GROUPS.map((group) => (
              <FileCard key={group.id} title={group.title}>
                {BATCH_FILE_FIELDS.filter((f) => f.group === group.id).map(
                  (f) => (
                    <FileField
                      key={f.key}
                      field={f.field}
                      label={FILE_LABELS[f.key]}
                      accept={f.accept}
                      chosen={fileState[f.key]}
                      onChange={(file) => onFileChange(f.key, f.accept, file)}
                    />
                  ),
                )}
              </FileCard>
            ))}
          </div>

          <div className="flex justify-end gap-3 border-t border-foreground/[.08] px-6 py-4">
            <button
              type="button"
              onClick={close}
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
              {isPending ? "Creating…" : "Create batch"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** The required batch-name text field. */
function NameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        Name
      </label>
      <input
        id={id}
        name="name"
        type="text"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="e.g. Spring run 2026"
        className="h-10 w-full rounded-lg border border-foreground/15 bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/40 hover:border-foreground/25 focus-visible:border-foreground/25 focus-visible:ring-2 focus-visible:ring-primary"
      />
    </div>
  );
}

/** A titled card grouping a set of related file inputs (MZmine / GNPS). */
function FileCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-foreground/[.12] p-4">
      <legend className="px-1 text-xs font-semibold tracking-tight text-foreground/70">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

/**
 * One required file input: a label, the native file picker (accept hint set to
 * the expected extension), and a line showing the chosen filename or a wrong-
 * extension warning. The input is `required` and carries the mf_service field
 * name; the server renames it to the expected filename on upload.
 */
function FileField({
  field,
  label,
  accept,
  chosen,
  onChange,
}: {
  field: string;
  label: string;
  accept: string;
  chosen: { name: string; valid: boolean } | undefined;
  onChange: (file: File | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-foreground/80">
        {label}
        <span className="ml-1 text-foreground/40">({accept})</span>
      </label>
      <input
        id={id}
        name={field}
        type="file"
        required
        accept={accept}
        onChange={(event) => onChange(event.target.files?.[0] ?? undefined)}
        className="block w-full cursor-pointer text-sm text-foreground/70 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-foreground/[.06] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground/80 hover:file:bg-foreground/[.1] focus-visible:outline-none"
      />
      {chosen && !chosen.valid ? (
        <span className="text-xs text-[#b91c1c]">
          Expected a {accept} file.
        </span>
      ) : null}
    </div>
  );
}
