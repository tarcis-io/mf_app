import { beforeEach, describe, expect, it, vi } from "vitest";

// The action reads the session via `auth()`, calls `createBatch`, and
// revalidates the page. Stub all three so the test asserts the action's own
// orchestration (session passthrough, result shaping, revalidation) without the
// Auth.js runtime, a real network call, or Next's cache. `createBatch`'s own
// behavior is covered in `lib/mf-service.test.ts`.
const { auth, createBatch, renameBatch, deleteBatch, revalidatePath } =
  vi.hoisted(() => ({
    auth: vi.fn(),
    createBatch: vi.fn(),
    renameBatch: vi.fn(),
    deleteBatch: vi.fn(),
    revalidatePath: vi.fn(),
  }));

vi.mock("@/auth", () => ({ auth }));
vi.mock("next/cache", () => ({ revalidatePath }));

// Keep the real BATCH_FILE_FIELDS + error classes (the actions read the field
// list and do `instanceof` checks); stub only the network calls.
vi.mock("@/lib/mf-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mf-service")>();
  return { ...actual, createBatch, renameBatch, deleteBatch };
});

import {
  DuplicateBatchNameError,
  BatchNotFoundError,
  BATCH_FILE_FIELDS,
} from "@/lib/mf-service";
import {
  createBatchAction,
  deleteBatchAction,
  renameBatchAction,
} from "./actions";

/** A FormData with a name and all five required files present and non-empty. */
function makeFormData(overrides: { name?: string | null; omit?: string } = {}) {
  const form = new FormData();
  if (overrides.name !== null) {
    form.set("name", overrides.name ?? "Spring run");
  }
  for (const { field } of BATCH_FILE_FIELDS) {
    if (overrides.omit === field) continue;
    form.append(field, new File(["data"], `${field}.csv`, { type: "text/csv" }));
  }
  return form;
}

beforeEach(() => {
  auth.mockReset();
  createBatch.mockReset();
  renameBatch.mockReset();
  deleteBatch.mockReset();
  revalidatePath.mockReset();
  auth.mockResolvedValue({ user: { id: "user-123" } });
  createBatch.mockResolvedValue({ id: "b1", status: "creating" });
  renameBatch.mockResolvedValue({ id: "b1", name: "Renamed", status: "created" });
  deleteBatch.mockResolvedValue(undefined);
});

describe("createBatchAction", () => {
  it("passes the session user id, name, and files to createBatch", async () => {
    auth.mockResolvedValue({ user: { id: "google-sub-xyz" } });

    const result = await createBatchAction(makeFormData({ name: "Spring run" }));

    expect(result.ok).toBe(true);
    expect(createBatch).toHaveBeenCalledOnce();
    const [userId, name, files] = createBatch.mock.calls[0]!;
    expect(userId).toBe("google-sub-xyz");
    expect(name).toBe("Spring run");
    // Every required file key is present in the files object handed to createBatch.
    for (const { key } of BATCH_FILE_FIELDS) {
      expect(files[key], `file ${key}`).toBeInstanceOf(File);
    }
  });

  it("revalidates the batches page AND home on success", async () => {
    await createBatchAction(makeFormData());

    // Both views read the batch list: /batches directly, and / via the home
    // BatchesCard total — so both must be revalidated or the home count goes stale.
    expect(revalidatePath).toHaveBeenCalledWith("/batches");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("trims the submitted name before sending", async () => {
    await createBatchAction(makeFormData({ name: "  Spring run  " }));

    expect(createBatch.mock.calls[0]![1]).toBe("Spring run");
  });

  it("returns a duplicate result (no throw) when the name is taken", async () => {
    createBatch.mockRejectedValue(new DuplicateBatchNameError("Spring run"));

    const result = await createBatchAction(makeFormData());

    expect(result.ok).toBe(false);
    expect(result.duplicate).toBe(true);
    expect(result.error).toMatch(/already exists/i);
    // A failed create must not revalidate.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a generic (non-duplicate) result on any other failure", async () => {
    createBatch.mockRejectedValue(new Error("mf_service POST /batches failed: 422"));

    const result = await createBatchAction(makeFormData());

    expect(result.ok).toBe(false);
    expect(result.duplicate).toBe(false);
    expect(result.error).toBeTruthy();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request without calling createBatch", async () => {
    auth.mockResolvedValue({ user: {} });

    const result = await createBatchAction(makeFormData());

    expect(result.ok).toBe(false);
    expect(createBatch).not.toHaveBeenCalled();
  });

  it("rejects an empty name without calling createBatch", async () => {
    const result = await createBatchAction(makeFormData({ name: "   " }));

    expect(result.ok).toBe(false);
    expect(createBatch).not.toHaveBeenCalled();
  });

  it("rejects when a required file is missing", async () => {
    const result = await createBatchAction(
      makeFormData({ omit: "gnps_merged_results" }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/five files/i);
    expect(createBatch).not.toHaveBeenCalled();
  });
});

/** A FormData carrying just a (trimmed-or-not) name, for the rename action. */
function nameForm(name: string) {
  const form = new FormData();
  form.set("name", name);
  return form;
}

describe("renameBatchAction", () => {
  it("passes the session user id, batch id, and name to renameBatch", async () => {
    auth.mockResolvedValue({ user: { id: "google-sub-xyz" } });

    const result = await renameBatchAction("batch-1", nameForm("Renamed"));

    expect(result.ok).toBe(true);
    expect(renameBatch).toHaveBeenCalledWith("google-sub-xyz", "batch-1", "Renamed");
  });

  it("trims the name before sending", async () => {
    await renameBatchAction("batch-1", nameForm("  Renamed  "));
    expect(renameBatch.mock.calls[0]![2]).toBe("Renamed");
  });

  it("revalidates the batches page AND home on success", async () => {
    await renameBatchAction("batch-1", nameForm("Renamed"));
    expect(revalidatePath).toHaveBeenCalledWith("/batches");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("returns a duplicate result when the new name is taken", async () => {
    renameBatch.mockRejectedValue(new DuplicateBatchNameError("Renamed"));

    const result = await renameBatchAction("batch-1", nameForm("Renamed"));

    expect(result).toMatchObject({ ok: false, duplicate: true });
    expect(result.error).toMatch(/already exists/i);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a not-found result (refresh hint) when the batch is gone", async () => {
    renameBatch.mockRejectedValue(new BatchNotFoundError("batch-1"));

    const result = await renameBatchAction("batch-1", nameForm("Renamed"));

    expect(result.ok).toBe(false);
    expect(result.duplicate).toBe(false);
    expect(result.error).toMatch(/no longer exists/i);
  });

  it("returns a generic result on any other failure", async () => {
    renameBatch.mockRejectedValue(new Error("boom"));

    const result = await renameBatchAction("batch-1", nameForm("Renamed"));

    expect(result).toMatchObject({ ok: false, duplicate: false });
  });

  it("rejects an empty name without calling renameBatch", async () => {
    const result = await renameBatchAction("batch-1", nameForm("   "));
    expect(result.ok).toBe(false);
    expect(renameBatch).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request without calling renameBatch", async () => {
    auth.mockResolvedValue({ user: {} });
    const result = await renameBatchAction("batch-1", nameForm("Renamed"));
    expect(result.ok).toBe(false);
    expect(renameBatch).not.toHaveBeenCalled();
  });
});

describe("deleteBatchAction", () => {
  it("passes the session user id and batch id to deleteBatch, then revalidates", async () => {
    auth.mockResolvedValue({ user: { id: "google-sub-xyz" } });

    const result = await deleteBatchAction("batch-1");

    expect(result.ok).toBe(true);
    expect(deleteBatch).toHaveBeenCalledWith("google-sub-xyz", "batch-1");
    expect(revalidatePath).toHaveBeenCalledWith("/batches");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("treats an already-gone batch (404) as success and still revalidates", async () => {
    deleteBatch.mockRejectedValue(new BatchNotFoundError("batch-1"));

    const result = await deleteBatchAction("batch-1");

    // The user's goal was removal; a 404 means it's already gone — refresh so
    // the stale row disappears (both the list and the home count).
    expect(result.ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/batches");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("returns an error result on a non-404 failure (no revalidate)", async () => {
    deleteBatch.mockRejectedValue(new Error("boom"));

    const result = await deleteBatchAction("batch-1");

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request without calling deleteBatch", async () => {
    auth.mockResolvedValue({ user: {} });

    const result = await deleteBatchAction("batch-1");

    expect(result.ok).toBe(false);
    expect(deleteBatch).not.toHaveBeenCalled();
  });
});
