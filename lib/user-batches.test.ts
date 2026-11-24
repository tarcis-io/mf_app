import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Batch } from "@/lib/mf-service";

// loadUserBatches reads the session via `auth()` and fetches via `listBatches`.
// Stub both so we test the helper's own orchestration (session check, error
// shaping, logging) without the Auth.js runtime or a real network call. The
// card consumers (batches-card / batches-list-card) also exercise it end-to-end.
const { auth, listBatches } = vi.hoisted(() => ({
  auth: vi.fn(),
  listBatches: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/lib/mf-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mf-service")>();
  return { ...actual, listBatches };
});

import { loadUserBatches } from "./user-batches";

function makeBatch(): Batch {
  return {
    id: "b1",
    user_id: "user-123",
    name: "run",
    created: "2026-01-15T09:30:00Z",
    status: "created",
    error_message: null,
  };
}

beforeEach(() => {
  auth.mockReset();
  listBatches.mockReset();
  auth.mockResolvedValue({ user: { id: "user-123" } });
  listBatches.mockResolvedValue([makeBatch()]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadUserBatches", () => {
  it("returns the batches for the signed-in user, passing the id to listBatches", async () => {
    auth.mockResolvedValue({ user: { id: "google-sub-xyz" } });

    const result = await loadUserBatches("Test");

    expect(result).toEqual({ batches: [makeBatch()] });
    expect(listBatches).toHaveBeenCalledWith("google-sub-xyz");
  });

  it("returns an error result (without calling listBatches) when the session has no user id", async () => {
    auth.mockResolvedValue({ user: {} });

    const result = await loadUserBatches("Test");

    expect(result).toEqual({ error: true });
    expect(listBatches).not.toHaveBeenCalled();
  });

  it("returns an error result when listBatches throws, and logs it with the label", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    listBatches.mockRejectedValue(new Error("mf_service GET /batches failed: 500"));

    const result = await loadUserBatches("BatchesCard");

    expect(result).toEqual({ error: true });
    // The failure is logged server-side (with the caller's label) so a backend
    // outage is diagnosable rather than a silent error state.
    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy.mock.calls[0]![0]).toContain("BatchesCard");
  });
});
