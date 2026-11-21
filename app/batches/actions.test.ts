import { beforeEach, describe, expect, it, vi } from "vitest";

// The action reads the session via `auth()`, calls `createBatch`, and
// revalidates the page. Stub all three so the test asserts the action's own
// orchestration (session passthrough, result shaping, revalidation) without the
// Auth.js runtime, a real network call, or Next's cache. `createBatch`'s own
// behavior is covered in `lib/mf-service.test.ts`.
const { auth, createBatch, revalidatePath } = vi.hoisted(() => ({
  auth: vi.fn(),
  createBatch: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth }));
vi.mock("next/cache", () => ({ revalidatePath }));

// Keep the real BATCH_FILE_FIELDS + DuplicateBatchNameError (the action reads
// the field list and does an `instanceof` check); stub only the network call.
vi.mock("@/lib/mf-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mf-service")>();
  return { ...actual, createBatch };
});

import { DuplicateBatchNameError, BATCH_FILE_FIELDS } from "@/lib/mf-service";
import { createBatchAction } from "./actions";

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
  revalidatePath.mockReset();
  auth.mockResolvedValue({ user: { id: "user-123" } });
  createBatch.mockResolvedValue({ id: "b1", status: "creating" });
});

describe("createBatchAction", () => {
  it("passes the session user id, name, and files to createBatch", async () => {
    auth.mockResolvedValue({ user: { id: "google-sub-xyz" } });

    const result = await createBatchAction(makeFormData({ name: "Spring run" }));

    expect(result.ok).toBe(true);
    expect(createBatch).toHaveBeenCalledOnce();
    const [userId, name, files] = createBatch.mock.calls[0];
    expect(userId).toBe("google-sub-xyz");
    expect(name).toBe("Spring run");
    // Every required file key is present in the files object handed to createBatch.
    for (const { key } of BATCH_FILE_FIELDS) {
      expect(files[key], `file ${key}`).toBeInstanceOf(File);
    }
  });

  it("revalidates the batches page on success", async () => {
    await createBatchAction(makeFormData());

    expect(revalidatePath).toHaveBeenCalledWith("/batches");
  });

  it("trims the submitted name before sending", async () => {
    await createBatchAction(makeFormData({ name: "  Spring run  " }));

    expect(createBatch.mock.calls[0][1]).toBe("Spring run");
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
