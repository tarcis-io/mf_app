import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BATCH_STATUSES,
  listBatches,
  summarizeBatches,
  type Batch,
} from "./mf-service";

/** A batch with sensible defaults; override any field per test. */
function makeBatch(overrides: Partial<Batch> = {}): Batch {
  return {
    id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    user_id: "user-123",
    name: "Spring run",
    created: "2026-01-15T09:30:00Z",
    status: "created",
    error_message: null,
    ...overrides,
  };
}

describe("listBatches", () => {
  beforeEach(() => {
    vi.stubEnv("MF_SERVICE_URL", "https://mf-service.massflow.ai");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("GETs {MF_SERVICE_URL}/batches with the X-User-Id header, uncached", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("[]", { status: 200 }));

    await listBatches("google-sub-123");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mf-service.massflow.ai/batches");
    expect(new Headers(init?.headers).get("X-User-Id")).toBe("google-sub-123");
    // Per-user, live data: must not be cached across requests.
    expect(init?.cache).toBe("no-store");
  });

  it.each([
    ["https://mf-service.massflow.ai/", "one trailing slash"],
    ["https://mf-service.massflow.ai//", "several trailing slashes"],
  ])(
    "strips trailing slashes on the base URL so the path doesn't double up (%s)",
    async (base) => {
      vi.stubEnv("MF_SERVICE_URL", base);
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("[]", { status: 200 }));

      await listBatches("user-123");

      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://mf-service.massflow.ai/batches",
      );
    },
  );

  it("returns the parsed batch list on success", async () => {
    const batches = [makeBatch(), makeBatch({ id: "other", status: "error" })];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(batches), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await listBatches("user-123");

    expect(result).toHaveLength(2);
    expect(result[1].status).toBe("error");
  });

  it("throws on a non-2xx response (so the caller can show an error state)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500, statusText: "Internal Server Error" }),
    );

    await expect(listBatches("user-123")).rejects.toThrow(/500/);
  });

  it("throws when MF_SERVICE_URL is unset", async () => {
    vi.stubEnv("MF_SERVICE_URL", undefined as unknown as string);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(listBatches("user-123")).rejects.toThrow(/MF_SERVICE_URL/);
    // We never attempt the request without a base URL.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("summarizeBatches", () => {
  it("counts the total and every status, including zeros", () => {
    const summary = summarizeBatches([
      makeBatch({ status: "created" }),
      makeBatch({ status: "created" }),
      makeBatch({ status: "processing" }),
      makeBatch({ status: "processed" }),
      makeBatch({ status: "error" }),
    ]);

    expect(summary.total).toBe(5);
    expect(summary.counts).toEqual({
      creating: 0,
      created: 2,
      processing: 1,
      processed: 1,
      error: 1,
    });
  });

  it("returns a zeroed breakdown for an empty list", () => {
    const summary = summarizeBatches([]);

    expect(summary.total).toBe(0);
    for (const status of BATCH_STATUSES) {
      expect(summary.counts[status]).toBe(0);
    }
  });

  it("ignores an unexpected status value but still counts it in the total", () => {
    const summary = summarizeBatches([
      makeBatch(),
      makeBatch({ status: "bogus" as Batch["status"] }),
    ]);

    // The bad value isn't added to any known bucket...
    const bucketed = Object.values(summary.counts).reduce((a, b) => a + b, 0);
    expect(bucketed).toBe(1);
    // ...but the total still reflects the full list length.
    expect(summary.total).toBe(2);
  });
});
