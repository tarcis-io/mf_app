"use client";

import { useId, useMemo, useState } from "react";

import { StatusBadge, STATUS_LABELS } from "@/components/batch-status";
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
              <StatusBadge status={batch.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Centered muted message for the two empty states (no batches / no matches). */
function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-sm text-foreground/50">{children}</p>
  );
}
