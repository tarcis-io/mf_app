"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  BATCH_FILE_FIELDS,
  BatchNotFoundError,
  createBatch,
  deleteBatch,
  DuplicateBatchNameError,
  renameBatch,
  type BatchFileKey,
  type BatchFiles,
} from "@/lib/mf-service";

/**
 * Server Action behind the "New batch" dialog (see `components/new-batch-dialog`).
 * Colocated with the Batches page rather than in `app/actions.ts` (which is the
 * auth actions) so batch concerns stay together and discoverable.
 *
 * It runs on the server, so the per-user `X-User-Id` and the `mf_service` base
 * URL never reach the browser: the dialog (a Client Component) submits the form
 * fields + files, and this action reads the session, forwards them to
 * `createBatch`, and revalidates the list.
 *
 * Returns a typed result instead of throwing, so the dialog can keep itself
 * open and show a banner on failure, then close + reset on success. The
 * `duplicate` flag lets the dialog treat a taken name as a field-level problem
 * (it marks the name input `aria-invalid` and focuses it) rather than just a
 * generic banner:
 *   - `{ ok: true }`                      — created; the list has been revalidated.
 *   - `{ ok: false, duplicate: true }`    — the name is already taken (409).
 *   - `{ ok: false, duplicate: false }`   — anything else (missing file, network, …).
 */
export interface CreateBatchResult {
  ok: boolean;
  /** When `ok` is false, whether the failure was a duplicate name (vs. a generic error). */
  duplicate?: boolean;
  /** A human-readable message for the error banner (absent on success). */
  error?: string;
}

export async function createBatchAction(
  formData: FormData,
): Promise<CreateBatchResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false, duplicate: false, error: "Your session has expired. Please sign in again." };
  }

  const name = (formData.get("name") ?? "").toString().trim();
  if (name === "") {
    return { ok: false, duplicate: false, error: "Please enter a batch name." };
  }

  // Pull the five required files out of the submitted form by their field
  // names. A missing or non-File entry is rejected here rather than sending a
  // malformed request (the dialog also validates, so this is defense-in-depth).
  const files = {} as BatchFiles;
  for (const { key, field } of BATCH_FILE_FIELDS) {
    const value = formData.get(field);
    if (!(value instanceof File) || value.size === 0) {
      return {
        ok: false,
        duplicate: false,
        error: "Please choose all five files.",
      };
    }
    files[key as BatchFileKey] = value;
  }

  try {
    await createBatch(userId, name, files);
  } catch (error) {
    if (error instanceof DuplicateBatchNameError) {
      return { ok: false, duplicate: true, error: error.message };
    }
    // Log server-side for diagnosability (status / network), but hand the user
    // a generic message rather than leaking internals.
    console.error("createBatchAction: failed to create batch", error);
    return {
      ok: false,
      duplicate: false,
      error: "Couldn't create the batch. Please try again.",
    };
  }

  // The new batch (status `creating`) should appear at the top of the list, so
  // revalidate the Batches page's cached render.
  revalidatePath("/batches");
  return { ok: true };
}

/**
 * Server Action behind the "Edit batch" dialog: rename one batch. Same shape
 * and reasoning as `createBatchAction` — runs server-side (so `X-User-Id` stays
 * off the client), returns a typed result so the dialog can show a banner
 * (distinguishing a duplicate name) and close + refresh on success.
 *
 * `id` is bound by the caller (the dialog knows which batch it's editing); the
 * new name comes from the submitted form.
 */
export async function renameBatchAction(
  id: string,
  formData: FormData,
): Promise<CreateBatchResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      duplicate: false,
      error: "Your session has expired. Please sign in again.",
    };
  }

  const name = (formData.get("name") ?? "").toString().trim();
  if (name === "") {
    return { ok: false, duplicate: false, error: "Please enter a batch name." };
  }

  try {
    await renameBatch(userId, id, name);
  } catch (error) {
    if (error instanceof DuplicateBatchNameError) {
      return { ok: false, duplicate: true, error: error.message };
    }
    if (error instanceof BatchNotFoundError) {
      return {
        ok: false,
        duplicate: false,
        error: "That batch no longer exists. Refresh the list and try again.",
      };
    }
    console.error("renameBatchAction: failed to rename batch", error);
    return {
      ok: false,
      duplicate: false,
      error: "Couldn't rename the batch. Please try again.",
    };
  }

  revalidatePath("/batches");
  return { ok: true };
}

/**
 * Server Action behind the "Delete batch" confirmation dialog: delete one
 * batch. Returns a typed result (no `duplicate` case) so the dialog can show a
 * banner on failure and close + refresh on success. `id` is bound by the caller.
 */
export async function deleteBatchAction(
  id: string,
): Promise<CreateBatchResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      error: "Your session has expired. Please sign in again.",
    };
  }

  try {
    await deleteBatch(userId, id);
  } catch (error) {
    // A batch that's already gone is effectively success from the user's point
    // of view: the goal was to remove it. Refresh so the stale row disappears.
    if (error instanceof BatchNotFoundError) {
      revalidatePath("/batches");
      return { ok: true };
    }
    console.error("deleteBatchAction: failed to delete batch", error);
    return {
      ok: false,
      error: "Couldn't delete the batch. Please try again.",
    };
  }

  revalidatePath("/batches");
  return { ok: true };
}
