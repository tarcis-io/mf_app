import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Batch } from "@/lib/mf-service";

// The card reads the session via `auth()` and fetches via `@/lib/mf-service`.
// Both are stubbed here so the test drives the card's rendering directly,
// without the Auth.js runtime or a real network call. (The client's own
// behavior is covered in `lib/mf-service.test.ts`.)
const { auth, listBatches } = vi.hoisted(() => ({
  auth: vi.fn(),
  listBatches: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth }));

// Keep the real `summarizeBatches` + `BATCH_STATUSES` (pure helpers worth
// exercising through the card); only `listBatches` is stubbed.
vi.mock("@/lib/mf-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mf-service")>();
  return { ...actual, listBatches };
});

// next/link's real click handler hands off to the App Router, which isn't wired
// up in jsdom. The card only needs Link to render an anchor with its href (the
// "View all batches" action), so stub it with a plain anchor (same approach as
// the other component tests).
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { STATUS_COLORS, STATUS_LABELS } from "./batch-status";
import BatchesCard from "./batches-card";

function makeBatch(status: Batch["status"]): Batch {
  return {
    id: crypto.randomUUID(),
    user_id: "user-123",
    name: "run",
    created: "2026-01-15T09:30:00Z",
    status,
    error_message: null,
  };
}

/** Render the async Server Component by awaiting its resolved tree. */
async function renderCard() {
  render(await BatchesCard());
}

beforeEach(() => {
  auth.mockResolvedValue({ user: { id: "user-123" } });
  listBatches.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("BatchesCard", () => {
  it("passes the session user id through to listBatches (the X-User-Id)", async () => {
    auth.mockResolvedValue({ user: { id: "google-sub-xyz" } });
    listBatches.mockResolvedValue([]);

    await renderCard();

    expect(listBatches).toHaveBeenCalledWith("google-sub-xyz");
  });

  it("shows the total and a breakdown of all five statuses", async () => {
    listBatches.mockResolvedValue([
      makeBatch("created"),
      makeBatch("created"),
      makeBatch("processing"),
      makeBatch("processed"),
      makeBatch("error"),
    ]);

    await renderCard();

    const card = screen.getByRole("region", { name: "Batches" });

    // Total.
    expect(within(card).getByText("5")).toBeInTheDocument();
    expect(within(card).getByText("batches total")).toBeInTheDocument();

    // Every status label is present...
    for (const label of [
      "Creating",
      "Created",
      "Processing",
      "Processed",
      "Error",
    ]) {
      expect(within(card).getByText(label)).toBeInTheDocument();
    }

    // ...and each count sits next to its label (a <div> row: <dt>label</dt><dd>n</dd>).
    const row = (label: string) =>
      within(card).getByText(label).closest("div")!;
    expect(within(row("Created")).getByText("2")).toBeInTheDocument();
    expect(within(row("Processing")).getByText("1")).toBeInTheDocument();
    expect(within(row("Creating")).getByText("0")).toBeInTheDocument();
  });

  it("uses the singular 'batch' when the total is exactly one", async () => {
    listBatches.mockResolvedValue([makeBatch("created")]);

    await renderCard();

    expect(screen.getByText("batch total")).toBeInTheDocument();
  });

  it("shows an error state (not a throw) when the service call fails", async () => {
    listBatches.mockRejectedValue(new Error("mf_service GET /batches failed: 500"));

    await renderCard();

    expect(
      screen.getByText(/couldn't load batches/i),
    ).toBeInTheDocument();
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

    // The shared batches glyph sits beside the heading text. It's decorative
    // (aria-hidden), so the heading's accessible name stays "Batches"; reach the
    // svg through the heading element rather than by role.
    const heading = screen.getByRole("heading", { name: "Batches" });
    const icon = heading.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("renders a colored indicator dot for every status", async () => {
    listBatches.mockResolvedValue([makeBatch("created")]);

    await renderCard();

    const card = screen.getByRole("region", { name: "Batches" });
    // One dot per status row, each carrying its status's semantic color inline.
    // Derive the expectations from the source maps (STATUS_LABELS/STATUS_COLORS)
    // so a palette change updates the test automatically instead of breaking it.
    for (const [status, label] of Object.entries(STATUS_LABELS)) {
      const row = within(card).getByText(label).closest("div")!;
      // The dot is the decorative span inside the row's <dt>.
      const dot = row.querySelector('span[aria-hidden="true"]');
      expect(dot).not.toBeNull();
      expect(dot).toHaveStyle({
        backgroundColor: STATUS_COLORS[status as keyof typeof STATUS_COLORS],
      });
    }
  });

  it("links to the full batches page from the card", async () => {
    listBatches.mockResolvedValue([]);

    await renderCard();

    const link = screen.getByRole("link", { name: /view all batches/i });
    expect(link).toHaveAttribute("href", "/batches");
  });

  it("keeps the batches link available even in the error state", async () => {
    // The link lives in the card shell (shared by both states), so a failed
    // load still offers a way through to the full page.
    listBatches.mockRejectedValue(new Error("boom"));

    await renderCard();

    expect(screen.getByText(/couldn't load batches/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view all batches/i }),
    ).toHaveAttribute("href", "/batches");
  });
});
