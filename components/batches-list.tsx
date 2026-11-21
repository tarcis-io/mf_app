"use client";

import { useCallback, useId, useMemo, useState } from "react";

import { StatusBadge, STATUS_LABELS } from "@/components/batch-status";
import DeleteBatchDialog from "@/components/delete-batch-dialog";
import EditBatchDialog, {
  type EditableBatch,
} from "@/components/edit-batch-dialog";
import { BATCH_STATUSES, type BatchStatus } from "@/lib/mf-service";

/**
 * One row's worth of data for the list. A projection of `Batch` (see
 * `@/lib/mf-service`) carrying only what a row renders, plus `createdLabel` —
 * the human-readable date, formatted on the server (see `BatchesListCard`) so
 * the output is deterministic and can't cause a hydration mismatch here. The
 * raw ISO `created` is kept for the `<time dateTime>` machine-readable value.
 */
export interface BatchListItem {
  id: string;
  name: string;
  status: BatchStatus;
  /** Raw ISO timestamp from mf_service, e.g. `2026-01-15T09:30:00Z`. */
  created: string;
  /** Server-formatted display date, e.g. `15 Jan 2026`. */
  createdLabel: string;
}

/** Sentinel for the status `<select>`'s "all statuses" option. */
const ALL = "all";

interface BatchesListProps {
  /**
   * The user's batches, already sorted newest-first by the server. The list
   * preserves this order; filtering never reorders.
   */
  batches: BatchListItem[];
}

/**
 * Interactive list of the signed-in user's batches, with two filters: a
 * free-text name filter (live, case-insensitive substring match) and a
 * single-select status combo box (`All statuses` + the five states). Both are
 * local component state — nothing is pushed to the URL and no refetch happens;
 * the server hands down the full sorted list once and all filtering is in the
 * browser.
 *
 * A Client Component: it owns the filter inputs' state. The data fetch itself
 * stays on the server (see `BatchesListCard`) so the `mf_service` base URL and
 * the per-user `X-User-Id` header never reach the browser.
 *
 * Rows show the batch name, a colored status badge (shared with the home
 * card — see `@/components/batch-status`), and the created date, in the
 * server's newest-first order. Empty states are contextual: a different message
 * when the user has no batches at all versus when the filters exclude them all.
 */
export default function BatchesList({ batches }: BatchesListProps) {
  const [nameQuery, setNameQuery] = useState("");
  const [status, setStatus] = useState<BatchStatus | typeof ALL>(ALL);

  // The field ids are generated so the component can appear more than once on a
  // page without colliding label/control associations.
  const nameFilterId = useId();
  const statusFilterId = useId();

  const filtered = useMemo(() => {
    const needle = nameQuery.trim().toLowerCase();
    return batches.filter((batch) => {
      const matchesName =
        needle === "" || batch.name.toLowerCase().includes(needle);
      const matchesStatus = status === ALL || batch.status === status;
      return matchesName && matchesStatus;
    });
  }, [batches, nameQuery, status]);

  // "No batches yet" (the account has none) reads differently from "nothing
  // matches your filters" (there are batches, just not in this view), so the
  // empty state branches on whether any batches exist at all.
  const hasNoBatches = batches.length === 0;

  // Which batch (if any) each row-action dialog is open for. Only the id + name
  // are needed to drive edit/delete, so pass just those.
  const [editing, setEditing] = useState<EditableBatch | null>(null);
  const [deleting, setDeleting] = useState<EditableBatch | null>(null);

  const closeEdit = useCallback(() => setEditing(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  return (
    <div className="flex flex-col gap-4">
      {/* Filters. Stack on mobile; sit side by side (name taking the slack) on
          wider cards. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label
            htmlFor={nameFilterId}
            className="text-xs font-medium text-foreground/60"
          >
            Filter by name
          </label>
          <input
            id={nameFilterId}
            type="search"
            value={nameQuery}
            onChange={(event) => setNameQuery(event.target.value)}
            placeholder="Search batches…"
            className="h-10 w-full rounded-lg border border-foreground/15 bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/40 hover:border-foreground/25 focus-visible:border-foreground/25 focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <div className="flex flex-col gap-1 sm:w-48">
          <label
            htmlFor={statusFilterId}
            className="text-xs font-medium text-foreground/60"
          >
            Filter by status
          </label>
          <select
            id={statusFilterId}
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as BatchStatus | typeof ALL)
            }
            className="h-10 w-full cursor-pointer rounded-lg border border-foreground/15 bg-background px-3 text-sm text-foreground outline-none transition-colors hover:border-foreground/25 focus-visible:border-foreground/25 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value={ALL}>All statuses</option>
            {BATCH_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results. */}
      {hasNoBatches ? (
        <EmptyState>You don&apos;t have any batches yet.</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>No batches match your filters.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-foreground/[.08]">
          {filtered.map((batch) => (
            <li
              key={batch.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-foreground">
                  {batch.name}
                </span>
                <time
                  dateTime={batch.created}
                  className="text-xs text-foreground/50"
                >
                  {batch.createdLabel}
                </time>
              </div>
              {/* Right side: status, then the per-row edit/delete actions. */}
              <div className="flex shrink-0 items-center gap-1.5">
                <StatusBadge status={batch.status} />
                <div className="flex items-center gap-0.5">
                  <IconButton
                    label={`Edit ${batch.name}`}
                    onClick={() =>
                      setEditing({ id: batch.id, name: batch.name })
                    }
                  >
                    <PencilIcon />
                  </IconButton>
                  <IconButton
                    label={`Delete ${batch.name}`}
                    destructive
                    onClick={() =>
                      setDeleting({ id: batch.id, name: batch.name })
                    }
                  >
                    <TrashIcon />
                  </IconButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Row-action dialogs, rendered once and controlled by the state above.
          `onDone` just clears the target — the list itself refreshes because
          the actions call revalidatePath. */}
      <EditBatchDialog
        batch={editing}
        open={editing !== null}
        onClose={closeEdit}
        onDone={closeEdit}
      />
      <DeleteBatchDialog
        batch={deleting}
        open={deleting !== null}
        onClose={closeDelete}
        onDone={closeDelete}
      />
    </div>
  );
}

/** A compact, square icon button for the per-row actions. */
function IconButton({
  label,
  onClick,
  destructive = false,
  children,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-foreground/50 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none ${
        destructive
          ? "hover:bg-[#ef4444]/[.1] hover:text-[#dc2626]"
          : "hover:bg-foreground/[.06] hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** Pencil glyph for the edit action (decorative; the button carries the label). */
function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/** Trash glyph for the delete action (decorative; the button carries the label). */
function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

/** Centered muted message for the two empty states (no batches / no matches). */
function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-sm text-foreground/50">{children}</p>
  );
}
