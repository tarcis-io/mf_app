"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  BATCH_FILE_FIELDS,
  createBatch,
  DuplicateBatchNameError,
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
 * open and show a banner on failure (distinguishing a duplicate name from any
 * other error) and close + reset on success:
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
