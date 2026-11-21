import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Batch } from "@/lib/mf-service";

// The card reads the session via `auth()` and fetches via `@/lib/mf-service`.
// Both are stubbed so the test drives rendering directly, without the Auth.js
// runtime or a real network call. (The client's own fetch behavior is covered
// in `lib/mf-service.test.ts`; the list's filtering in `batches-list.test.tsx`.)
const { auth, listBatches } = vi.hoisted(() => ({
  auth: vi.fn(),
  listBatches: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth }));

// Keep everything else in mf-service real (types, BATCH_STATUSES); stub only the
// network call.
vi.mock("@/lib/mf-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mf-service")>();
  return { ...actual, listBatches };
});

import BatchesListCard from "./batches-list-card";

function makeBatch(overrides: Partial<Batch> = {}): Batch {
  return {
    id: crypto.randomUUID(),
    user_id: "user-123",
    name: "run",
    created: "2026-01-15T09:30:00Z",
    status: "created",
    error_message: null,
    ...overrides,
  };
}

/** Render the async Server Component by awaiting its resolved tree. */
async function renderCard() {
  render(await BatchesListCard());
}

/** The batch names in render order (the `.truncate` span in each row). */
function renderedNames() {
  const list = screen.queryByRole("list");
  if (!list) return [];
  return within(list)
    .getAllByRole("listitem")
    .map((li) => li.querySelector("span.truncate")?.textContent ?? "");
}

beforeEach(() => {
  auth.mockResolvedValue({ user: { id: "user-123" } });
  listBatches.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("BatchesListCard", () => {
  it("passes the session user id through to listBatches (the X-User-Id)", async () => {
    auth.mockResolvedValue({ user: { id: "google-sub-xyz" } });
    listBatches.mockResolvedValue([]);

    await renderCard();

    expect(listBatches).toHaveBeenCalledWith("google-sub-xyz");
  });

  it("renders the batches, newest first, regardless of the service's order", async () => {
    // Deliberately out of order from the service; the card must sort by created
    // descending before handing the list to the client component.
    listBatches.mockResolvedValue([
      makeBatch({ name: "Middle", created: "2026-02-10T00:00:00Z" }),
      makeBatch({ name: "Oldest", created: "2026-01-01T00:00:00Z" }),
      makeBatch({ name: "Newest", created: "2026-03-20T00:00:00Z" }),
    ]);

    await renderCard();

    expect(renderedNames()).toEqual(["Newest", "Middle", "Oldest"]);
  });

  it("formats the created date (fixed locale + UTC) for display", async () => {
    listBatches.mockResolvedValue([
      makeBatch({ name: "Alpha", created: "2026-01-15T09:30:00Z" }),
    ]);

    await renderCard();

    // en-GB + UTC → "15 Jan 2026", and the raw ISO is kept as the <time> value.
    const time = screen.getByText("15 Jan 2026");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("dateTime", "2026-01-15T09:30:00Z");
  });

  it("shows the empty state when the user has no batches", async () => {
    listBatches.mockResolvedValue([]);

    await renderCard();

    expect(screen.getByText(/don't have any batches yet/i)).toBeInTheDocument();
  });

  it("shows an error state (not a throw) when the service call fails", async () => {
    listBatches.mockRejectedValue(new Error("mf_service GET /batches failed: 500"));

    await renderCard();

    expect(screen.getByText(/couldn't load batches/i)).toBeInTheDocument();
    // The title still renders — only the body degrades.
    expect(screen.getByRole("heading", { name: "Batches" })).toBeInTheDocument();
  });

  it("shows the error state when the session has no user id", async () => {
    auth.mockResolvedValue({ user: {} });

    await renderCard();

    expect(screen.getByText(/couldn't load batches/i)).toBeInTheDocument();
    // We don't even attempt the fetch without an id.
    expect(listBatches).not.toHaveBeenCalled();
  });

  it("renders the batches icon in the card title", async () => {
    listBatches.mockResolvedValue([]);

    await renderCard();

    const heading = screen.getByRole("heading", { name: "Batches" });
    const icon = heading.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });
});
