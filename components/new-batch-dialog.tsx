"use client";

import { useCallback, useId, useRef, useState, useTransition } from "react";

import { createBatchAction } from "@/app/batches/actions";
import Dialog from "@/components/dialog";
import { BATCH_FILE_FIELDS, type BatchFileKey } from "@/lib/mf-service";

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
 * A Client Component: it owns the open state, the form state, and client-side
 * validation. The modal shell (native `<dialog>`, backdrop-click / Escape to
 * close) comes from the shared `Dialog`; the actual upload runs server-side via
 * `createBatchAction`, so the `mf_service` URL and the per-user header never
 * reach the browser.
 *
 * Fields — a required Name plus the five required files grouped into an MZmine
 * card (3) and a GNPS card (2) — are all mandatory, and each file must carry its
 * expected extension before the form can submit. Server errors (a duplicate
 * name, a rejected upload, a network failure) surface in a single banner at the
 * top; on success the dialog closes and the list revalidates so the new
 * `creating` batch appears. The form is mounted only while open (keyed on each
 * open), so it always starts blank.
 */
export default function NewBatchDialog() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-background outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
      >
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
        New
      </button>

      <Dialog open={open} onClose={close} title="New batch">
        {/* Mounted only while open, so the form (its name + the un-clearable
            file inputs) is created fresh on each open and discarded on close —
            no stale values carry over between opens. */}
        {open ? <NewBatchForm onDone={close} /> : null}
      </Dialog>
    </>
  );
}

/** The batch-creation form body (everything inside the dialog shell). */
function NewBatchForm({ onDone }: { onDone: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Set when the server rejects the name as already taken (409), so the name
  // field can be marked invalid and focused. Cleared on any edit to the name.
  const [nameInvalid, setNameInvalid] = useState(false);
  // Mirrors which files are chosen + valid, to drive the submit button's
  // enabled state and the per-field hint. Keyed by BatchFileKey.
  const [fileState, setFileState] = useState<
    Partial<Record<BatchFileKey, { name: string; valid: boolean }>>
  >({});
  const [name, setName] = useState("");
  const errorId = useId();

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

  // Submittable only when the name is non-empty and every required file is both
  // chosen and has a valid extension.
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
          onDone();
        } else {
          setError(
            result.error ?? "Couldn't create the batch. Please try again.",
          );
          // A duplicate name is a field-level problem: mark the name invalid
          // and move focus to it so the user can fix the one thing that's wrong.
          if (result.duplicate) {
            setNameInvalid(true);
            nameRef.current?.focus();
          }
        }
      });
    },
    [canSubmit, onDone],
  );

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      // The banner is a form-level error (a duplicate name, a missing file, or a
      // network failure), so associate it with the form rather than any single
      // field. It also carries role="alert", which announces it on appearance.
      aria-describedby={error ? errorId : undefined}
      className="flex min-h-0 flex-col"
    >
      <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
        {error ? (
          <p
            id={errorId}
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/[.08] px-3 py-2 text-sm text-danger-text"
          >
            {error}
          </p>
        ) : null}

        <NameField
          ref={nameRef}
          value={name}
          invalid={nameInvalid}
          onChange={(next) => {
            setNameInvalid(false);
            setName(next);
          }}
        />

        {GROUPS.map((group) => (
          <FileCard key={group.id} title={group.title}>
            {BATCH_FILE_FIELDS.filter((f) => f.group === group.id).map((f) => (
              <FileField
                key={f.key}
                field={f.field}
                label={FILE_LABELS[f.key]}
                accept={f.accept}
                chosen={fileState[f.key]}
                onChange={(file) => onFileChange(f.key, f.accept, file)}
              />
            ))}
          </FileCard>
        ))}
      </div>

      <div className="flex justify-end gap-3 border-t border-foreground/[.08] px-6 py-4">
        <button
          type="button"
          onClick={onDone}
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
  );
}

/** The required batch-name text field. */
function NameField({
  ref,
  value,
  invalid = false,
  onChange,
}: {
  ref?: React.Ref<HTMLInputElement>;
  value: string;
  /** Marks the field invalid (e.g. the server rejected the name as a duplicate). */
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        Name
      </label>
      <input
        ref={ref}
        id={id}
        name="name"
        type="text"
        required
        // Focus the first field on open, matching the edit dialog. The form is
        // mounted fresh on each open (see NewBatchDialog), so this fires every time.
        autoFocus
        aria-invalid={invalid || undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="e.g. Spring run 2026"
        className={`h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/40 focus-visible:ring-2 focus-visible:ring-primary ${
          invalid
            ? "border-danger focus-visible:border-danger"
            : "border-foreground/15 hover:border-foreground/25 focus-visible:border-foreground/25"
        }`}
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
 * the expected extension), and a line showing a wrong-extension warning. The
 * input is `required` and carries the mf_service field name; the server renames
 * it to the expected filename on upload.
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
  const hintId = useId();
  const invalid = chosen !== undefined && !chosen.valid;
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
        // When the chosen file has the wrong extension, mark the field invalid
        // and tie it to the hint below so screen readers announce the problem
        // (the hint is otherwise just adjacent red text).
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? hintId : undefined}
        onChange={(event) => onChange(event.target.files?.[0] ?? undefined)}
        className="block w-full cursor-pointer text-sm text-foreground/70 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-foreground/[.06] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground/80 hover:file:bg-foreground/[.1] focus-visible:outline-none"
      />
      {invalid ? (
        <span id={hintId} className="text-xs text-danger-text">
          Expected a {accept} file.
        </span>
      ) : null}
    </div>
  );
}
