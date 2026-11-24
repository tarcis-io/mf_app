import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock google-auth-library so the service-to-service auth path can be driven
// without real Google credentials or the metadata server. `fetchIdToken`
// returns a canned token; `getIdTokenClient` is a spy so client reuse (caching)
// can be asserted. Tests reconfigure these per case (e.g. make fetchIdToken
// reject). Hoisted so the mock is wired before `./mf-service` is imported.
const { fetchIdToken, getIdTokenClient, GoogleAuth } = vi.hoisted(() => {
  const fetchIdToken = vi.fn(async () => "fake-id-token");
  const getIdTokenClient = vi.fn(async () => ({
    idTokenProvider: { fetchIdToken },
  }));
  // Must be a regular function (not an arrow): the code calls `new GoogleAuth()`,
  // and arrow functions aren't constructable. Returning an object from a
  // constructor makes `new` yield that object, so `new GoogleAuth()` gives
  // `{ getIdTokenClient }`. Kept as a vi.fn so call counts can be asserted.
  const GoogleAuth = vi.fn(function () {
    return { getIdTokenClient };
  });
  return { fetchIdToken, getIdTokenClient, GoogleAuth };
});
vi.mock("google-auth-library", () => ({ GoogleAuth }));

import {
  BATCH_FILE_FIELDS,
  BATCH_STATUSES,
  BatchNotFoundError,
  createBatch,
  deleteBatch,
  DuplicateBatchNameError,
  getServiceInfo,
  listBatches,
  renameBatch,
  summarizeBatches,
  type Batch,
  type BatchFiles,
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
    const [url, init] = fetchMock.mock.calls[0]!;
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

      expect(fetchMock.mock.calls[0]![0]).toBe(
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
    expect(result[1]!.status).toBe("error");
  });

  it("throws on a non-2xx response (so the caller can show an error state)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500, statusText: "Internal Server Error" }),
    );

    await expect(listBatches("user-123")).rejects.toThrow(/500/);
  });

  it("caps the request with an abort signal (so a hung backend doesn't stall)", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("[]", { status: 200 }));

    await listBatches("user-123");

    // The fetch carries an AbortSignal (from AbortSignal.timeout) so the render
    // can't hang indefinitely on mf_service.
    const init = fetchMock.mock.calls[0]![1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("requests a 5s timeout signal and rejects when it aborts", async () => {
    // Drive the real timeout wiring without faking timers (which don't reliably
    // intercept AbortSignal.timeout): stub AbortSignal.timeout to hand back a
    // controller's signal we can abort on demand, and assert both that the
    // function asks for the 5000ms cap and that an abort propagates as a
    // rejection (how the caller learns a hung backend gave up).
    const controller = new AbortController();
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);

    // A hung backend: fetch only settles if its signal aborts. Handle both
    // orderings — the signal may already be aborted by the time fetch runs (the
    // request builds behind an `await`, so the test's synchronous abort() can
    // land first) or abort later — mirroring how a real fetch rejects on a
    // pre-aborted signal immediately and on a live one when it fires.
    const abortError = () =>
      new DOMException("The operation timed out.", "TimeoutError");
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(abortError());
            return;
          }
          init?.signal?.addEventListener("abort", () => reject(abortError()));
        }),
    );

    // Fire the "timeout" before awaiting: whether this lands before or after
    // fetch is reached, the mock above rejects.
    const pending = listBatches("user-123");
    controller.abort();
    await expect(pending).rejects.toThrow(/timed out/i);

    expect(timeoutSpy).toHaveBeenCalledWith(5000);
  });

  it("rejects when fetch itself fails (network error, not a non-2xx)", async () => {
    // A connection refused / DNS failure rejects fetch outright (distinct from
    // an HTTP error response). It must propagate so the caller shows its error
    // state rather than treating it as success.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("fetch failed"),
    );

    await expect(listBatches("user-123")).rejects.toThrow(/fetch failed/);
  });

  it("throws when the body is valid JSON but not an array", async () => {
    // A 2xx with an object body (e.g. an error envelope) must not flow through
    // to summarizeBatches as if it were a batch list.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "nope" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(listBatches("user-123")).rejects.toThrow(/non-array/);
  });

  it("throws when the body isn't valid JSON (e.g. an HTML error page)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!doctype html><title>502</title>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    await expect(listBatches("user-123")).rejects.toThrow();
  });

  it("throws when MF_SERVICE_URL is unset", async () => {
    vi.stubEnv("MF_SERVICE_URL", undefined as unknown as string);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(listBatches("user-123")).rejects.toThrow(/MF_SERVICE_URL/);
    // We never attempt the request without a base URL.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getServiceInfo", () => {
  const INFO = {
    name: "mf_service",
    description: "MassFlow service: a FastAPI service exposing the MassFlow engine over HTTP.",
    version: "0.1.0",
    engine_version: "0.1.0",
  };

  beforeEach(() => {
    vi.stubEnv("MF_SERVICE_URL", "https://mf-service.massflow.ai");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("GETs {MF_SERVICE_URL}/version, uncached, with no X-User-Id (not per-user)", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(INFO), { status: 200 }));

    await getServiceInfo();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://mf-service.massflow.ai/version");
    expect(init?.cache).toBe("no-store");
    // /version is service identity, not per-user — no X-User-Id header.
    expect(new Headers(init?.headers).get("X-User-Id")).toBeNull();
    // Capped by the same 5s abort signal as the other calls (abort-propagation
    // is proven in the listBatches timeout test).
    expect(timeoutSpy).toHaveBeenCalledWith(5000);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns the parsed service info (version + engine_version)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(INFO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const info = await getServiceInfo();

    expect(info.version).toBe("0.1.0");
    expect(info.engine_version).toBe("0.1.0");
    expect(info.name).toBe("mf_service");
  });

  it("throws on a non-2xx response (so the caller can show 'unavailable')", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 503, statusText: "Service Unavailable" }),
    );

    await expect(getServiceInfo()).rejects.toThrow(/503/);
  });

  it("throws when the body is missing the version fields", async () => {
    // A 2xx whose body lacks version/engine_version (e.g. an older service or a
    // proxy error page) must not surface the wrong strings on the About card.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ name: "mf_service" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getServiceInfo()).rejects.toThrow(/version/);
  });

  it("throws when the body isn't valid JSON (e.g. an HTML error page)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!doctype html><title>502</title>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    await expect(getServiceInfo()).rejects.toThrow();
  });

  it("throws when MF_SERVICE_URL is unset (never attempts the request)", async () => {
    vi.stubEnv("MF_SERVICE_URL", undefined as unknown as string);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(getServiceInfo()).rejects.toThrow(/MF_SERVICE_URL/);
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

  it("ignores a status that collides with an Object.prototype key", () => {
    // Regression guard: a membership test using `in` would walk the prototype
    // chain, so these inherited keys would slip past the guard and corrupt
    // `counts` (e.g. counts.toString becoming a mangled string). The own-
    // property check must treat them exactly like any other unknown status.
    const summary = summarizeBatches([
      makeBatch({ status: "toString" as Batch["status"] }),
      makeBatch({ status: "constructor" as Batch["status"] }),
      makeBatch({ status: "hasOwnProperty" as Batch["status"] }),
      makeBatch({ status: "created" }),
    ]);

    // Only the real status is bucketed; no prototype key leaked in.
    expect(summary.counts).toEqual({
      creating: 0,
      created: 1,
      processing: 0,
      processed: 0,
      error: 0,
    });
    // Every known bucket is still a number (not a mangled function string).
    for (const status of BATCH_STATUSES) {
      expect(typeof summary.counts[status]).toBe("number");
    }
    // The total reflects the full list, collisions included.
    expect(summary.total).toBe(4);
  });
});

/**
 * Build the five required files, each with a deliberately *wrong* (user-chosen)
 * filename, so tests can prove `createBatch` ignores these and renames every
 * part to the service's expected filename.
 */
function makeFiles(): BatchFiles {
  const files = {} as BatchFiles;
  for (const { key } of BATCH_FILE_FIELDS) {
    files[key] = new File(["data"], `user-picked-${key}.xyz`, {
      type: "text/plain",
    });
  }
  return files;
}

describe("createBatch", () => {
  beforeEach(() => {
    vi.stubEnv("MF_SERVICE_URL", "https://mf-service.massflow.ai");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("POSTs multipart to {MF_SERVICE_URL}/batches with the X-User-Id header", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(makeBatch({ status: "creating" })), {
          status: 201,
        }),
      );

    await createBatch("google-sub-123", "Spring run", makeFiles());

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://mf-service.massflow.ai/batches");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("X-User-Id")).toBe("google-sub-123");
    expect(init?.body).toBeInstanceOf(FormData);
    // Content-Type must NOT be set by hand — the runtime derives the multipart
    // boundary from the FormData body. A manual value would break the upload.
    expect(new Headers(init?.headers).get("Content-Type")).toBeNull();
  });

  it("sends the name and all five files under their mf_service field names", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(makeBatch()), { status: 201 }));

    await createBatch("user-123", "Spring run", makeFiles());

    const body = fetchMock.mock.calls[0]![1]?.body as FormData;
    expect(body.get("name")).toBe("Spring run");
    for (const { field } of BATCH_FILE_FIELDS) {
      expect(body.get(field), `field ${field}`).toBeInstanceOf(File);
    }
    // Exactly name + 5 files, nothing stray.
    expect([...body.keys()].sort()).toEqual(
      ["name", ...BATCH_FILE_FIELDS.map((f) => f.field)].sort(),
    );
  });

  it("RENAMES each file to the service's expected filename (ignores the user's filename)", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(makeBatch()), { status: 201 }));

    await createBatch("user-123", "Spring run", makeFiles());

    const body = fetchMock.mock.calls[0]![1]?.body as FormData;
    // This is the core requirement: every part carries the fixed filename the
    // endpoint stores under, never the "user-picked-*.xyz" name from makeFiles.
    for (const { field, filename } of BATCH_FILE_FIELDS) {
      const part = body.get(field) as File;
      expect(part.name, `field ${field}`).toBe(filename);
      expect(part.name).not.toMatch(/user-picked/);
    }
    // Spot-check the specific expected names, including the GNPS .tsv and the
    // "reformated" spelling, so a typo in the mapping is caught.
    expect((body.get("mzmine_annotations") as File).name).toBe(
      "mzmine_annotations.csv",
    );
    expect((body.get("gnps_merged_results") as File).name).toBe(
      "gnps_merged_results.tsv",
    );
    expect((body.get("gnps_feature_table_reformated") as File).name).toBe(
      "gnps_feature_table_reformated.csv",
    );
  });

  it("returns the created batch on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(makeBatch({ name: "Spring run", status: "creating" })),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    const batch = await createBatch("user-123", "Spring run", makeFiles());

    expect(batch.name).toBe("Spring run");
    expect(batch.status).toBe("creating");
  });

  it("throws DuplicateBatchNameError on 409 (name taken)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "name taken" }), { status: 409 }),
    );

    await expect(
      createBatch("user-123", "Spring run", makeFiles()),
    ).rejects.toBeInstanceOf(DuplicateBatchNameError);
  });

  it("throws a generic error on other non-2xx (e.g. 422 missing file)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unprocessable", {
        status: 422,
        statusText: "Unprocessable Entity",
      }),
    );

    const err = await createBatch("user-123", "Spring run", makeFiles()).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(DuplicateBatchNameError);
    expect((err as Error).message).toMatch(/422/);
  });

  it("throws when MF_SERVICE_URL is unset (never attempts the request)", async () => {
    vi.stubEnv("MF_SERVICE_URL", undefined as unknown as string);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      createBatch("user-123", "Spring run", makeFiles()),
    ).rejects.toThrow(/MF_SERVICE_URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps the request with a 5s abort signal like the other calls", async () => {
    // Same cap as listBatches (abort-propagation is proven there); confirm this
    // caller also requests the 5000ms signal and passes it to fetch.
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(makeBatch()), { status: 201 }));

    await createBatch("user-123", "Spring run", makeFiles());

    expect(timeoutSpy).toHaveBeenCalledWith(5000);
    expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("renameBatch", () => {
  beforeEach(() => {
    vi.stubEnv("MF_SERVICE_URL", "https://mf-service.massflow.ai");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("PATCHes {MF_SERVICE_URL}/batches/{id} with JSON {name} and X-User-Id", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(makeBatch({ name: "Renamed" })), {
          status: 200,
        }),
      );

    await renameBatch("google-sub-123", "batch-1", "Renamed");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://mf-service.massflow.ai/batches/batch-1");
    expect(init?.method).toBe("PATCH");
    expect(new Headers(init?.headers).get("X-User-Id")).toBe("google-sub-123");
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(JSON.parse(init?.body as string)).toEqual({ name: "Renamed" });
  });

  it("url-encodes the batch id in the path", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(makeBatch()), { status: 200 }));

    await renameBatch("user-123", "a/b c", "Renamed");

    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://mf-service.massflow.ai/batches/a%2Fb%20c",
    );
  });

  it("returns the updated batch on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(makeBatch({ name: "Renamed" })), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const batch = await renameBatch("user-123", "batch-1", "Renamed");
    expect(batch.name).toBe("Renamed");
  });

  it("throws DuplicateBatchNameError on 409", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 409 }),
    );
    await expect(
      renameBatch("user-123", "batch-1", "Taken"),
    ).rejects.toBeInstanceOf(DuplicateBatchNameError);
  });

  it("throws BatchNotFoundError on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 404 }),
    );
    await expect(
      renameBatch("user-123", "missing", "Renamed"),
    ).rejects.toBeInstanceOf(BatchNotFoundError);
  });

  it("throws a generic error on other non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 500, statusText: "Internal Server Error" }),
    );
    const err = await renameBatch("user-123", "batch-1", "Renamed").catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(DuplicateBatchNameError);
    expect(err).not.toBeInstanceOf(BatchNotFoundError);
    expect((err as Error).message).toMatch(/500/);
  });

  it("caps the request with a 5s abort signal like the other calls", async () => {
    // Same cap as listBatches (the abort-propagates-as-rejection mechanism is
    // proven there); here we just confirm this caller also asks for the 5000ms
    // signal and passes it to fetch, so a dropped signal would be caught.
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(makeBatch()), { status: 200 }));

    await renameBatch("user-123", "batch-1", "Renamed");

    expect(timeoutSpy).toHaveBeenCalledWith(5000);
    expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("deleteBatch", () => {
  beforeEach(() => {
    vi.stubEnv("MF_SERVICE_URL", "https://mf-service.massflow.ai");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("DELETEs {MF_SERVICE_URL}/batches/{id} with X-User-Id", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await deleteBatch("google-sub-123", "batch-1");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://mf-service.massflow.ai/batches/batch-1");
    expect(init?.method).toBe("DELETE");
    expect(new Headers(init?.headers).get("X-User-Id")).toBe("google-sub-123");
  });

  it("resolves on a 204 (no body)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    await expect(deleteBatch("user-123", "batch-1")).resolves.toBeUndefined();
  });

  it("resolves on a 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(makeBatch()), { status: 200 }),
    );
    await expect(deleteBatch("user-123", "batch-1")).resolves.toBeUndefined();
  });

  it("throws BatchNotFoundError on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 404 }),
    );
    await expect(deleteBatch("user-123", "missing")).rejects.toBeInstanceOf(
      BatchNotFoundError,
    );
  });

  it("throws a generic error on other non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 500, statusText: "Internal Server Error" }),
    );
    const err = await deleteBatch("user-123", "batch-1").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(BatchNotFoundError);
    expect((err as Error).message).toMatch(/500/);
  });

  it("caps the request with a 5s abort signal like the other calls", async () => {
    // Same cap as listBatches (abort-propagation is proven there); confirm this
    // caller also requests the 5000ms signal and passes it to fetch.
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await deleteBatch("user-123", "batch-1");

    expect(timeoutSpy).toHaveBeenCalledWith(5000);
    expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("service-to-service auth (Google ID token)", () => {
  const BASE = "https://mf-service.massflow.ai";

  // These tests toggle NODE_ENV and rely on the module-level ID-token-client
  // cache in mf-service.ts. Reset the module registry before each so every test
  // starts with an empty cache and a clean view of the google-auth mocks, then
  // import a fresh copy of the module (the google-auth-library mock is hoisted,
  // so it re-applies to the fresh import). Mirrors the resetModules pattern in
  // auth.test.ts.
  async function freshModule() {
    vi.resetModules();
    return import("./mf-service");
  }

  beforeEach(() => {
    vi.stubEnv("MF_SERVICE_URL", BASE);
    // Re-establish the full mock implementations each test. `vi.restoreAllMocks`
    // in afterEach (needed to undo the per-test `vi.spyOn(fetch)`) also strips
    // these hoisted mocks' implementations, so set all three here rather than
    // relying on the one-time `vi.hoisted` defaults surviving between tests.
    fetchIdToken.mockReset().mockResolvedValue("fake-id-token");
    getIdTokenClient
      .mockReset()
      .mockResolvedValue({ idTokenProvider: { fetchIdToken } });
    GoogleAuth.mockReset().mockImplementation(function () {
      return { getIdTokenClient };
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("does NOT attach an Authorization header outside production (and never touches Google)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { listBatches } = await freshModule();

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("[]", { status: 200 }));

    await listBatches("user-123");

    const headers = new Headers(fetchMock.mock.calls[0]![1]?.headers);
    expect(headers.get("Authorization")).toBeNull();
    // The whole google-auth machinery must stay dormant locally.
    expect(GoogleAuth).not.toHaveBeenCalled();
    expect(getIdTokenClient).not.toHaveBeenCalled();
    expect(fetchIdToken).not.toHaveBeenCalled();
  });

  it("attaches a Bearer ID token in production, with the mf_service base URL as the audience", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { listBatches } = await freshModule();

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("[]", { status: 200 }));

    await listBatches("user-123");

    const headers = new Headers(fetchMock.mock.calls[0]![1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer fake-id-token");
    // Both the client and the token must be minted for the base URL audience.
    expect(getIdTokenClient).toHaveBeenCalledWith(BASE);
    expect(fetchIdToken).toHaveBeenCalledWith(BASE);
    // The per-user header still rides alongside the service token.
    expect(headers.get("X-User-Id")).toBe("user-123");
  });

  it("attaches the token on every endpoint (createBatch / getServiceInfo too)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { createBatch, getServiceInfo } = await freshModule();

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(makeBatch()), { status: 201 }),
      );

    await createBatch("user-123", "Spring run", makeFiles());
    expect(
      new Headers(fetchMock.mock.calls[0]![1]?.headers).get("Authorization"),
    ).toBe("Bearer fake-id-token");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          name: "mf_service",
          description: "d",
          version: "0.1.0",
          engine_version: "0.1.0",
        }),
        { status: 200 },
      ),
    );
    await getServiceInfo();
    expect(
      new Headers(fetchMock.mock.calls[1]![1]?.headers).get("Authorization"),
    ).toBe("Bearer fake-id-token");
  });

  it("fails the request (and doesn't fetch) when the token can't be minted in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fetchIdToken.mockRejectedValue(new Error("metadata server unreachable"));
    const { listBatches } = await freshModule();

    const fetchMock = vi.spyOn(globalThis, "fetch");

    const err = await listBatches("user-123").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    // The error is wrapped with actionable context and preserves the cause.
    expect((err as Error).message).toMatch(/Google ID token/i);
    expect((err as Error).cause).toBeInstanceOf(Error);
    // We must not send an unauthenticated request that Cloud Run would reject.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reuses one ID-token client across calls (built once, not per request)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { listBatches } = await freshModule();

    // A fresh Response per call — a single Response body can only be read once,
    // and this test makes three calls.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("[]", { status: 200 }),
    );

    await listBatches("user-123");
    await listBatches("user-123");
    await listBatches("user-123");

    // The client is cached by audience, so it's created once and only the token
    // is re-fetched (the library caches/refreshes that itself).
    expect(getIdTokenClient).toHaveBeenCalledTimes(1);
    expect(fetchIdToken).toHaveBeenCalledTimes(3);
  });
});
