import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// BatchesList now renders the edit/delete dialogs, which import the batches
// Server Actions (a "use server" module that pulls in @/auth). Stub that module
// so importing the list here doesn't spin up the Auth.js runtime. These tests
// cover the list's own rendering/filtering + that the row actions open the
// right dialog; the actions' behavior is covered in app/batches/actions.test.ts.
const { renameBatchAction, deleteBatchAction } = vi.hoisted(() => ({
  renameBatchAction: vi.fn(),
  deleteBatchAction: vi.fn(),
}));
vi.mock("@/app/batches/actions", () => ({
  renameBatchAction,
  deleteBatchAction,
}));

import { STATUS_COLORS } from "./batch-status";
import BatchesList, { type BatchListItem } from "./batches-list";

/** A list item with sensible defaults; override any field per test. */
function makeItem(overrides: Partial<BatchListItem> = {}): BatchListItem {
  return {
    id: crypto.randomUUID(),
    name: "Spring run",
    status: "created",
    created: "2026-01-15T09:30:00Z",
    createdLabel: "15 Jan 2026",
    ...overrides,
  };
}

/** The rendered batch rows (each <li> in the single results list). */
function rows() {
  const list = screen.queryByRole("list");
  return list ? within(list).getAllByRole("listitem") : [];
}

/**
 * The batch name shown in a row. The name is the first span (`.truncate`) in
 * the row's text column; reading it directly avoids a text regex accidentally
 * matching the status badge or the date in the same row.
 */
function nameOf(row: HTMLElement): string {
  return row.querySelector("span.truncate")?.textContent ?? "";
}

/** The visible batch names, in render order. */
function names() {
  return rows().map(nameOf);
}

beforeEach(() => {
  renameBatchAction.mockReset();
  deleteBatchAction.mockReset();
});

describe("BatchesList", () => {
  it("renders every batch with its name, status badge, and created date", () => {
    render(
      <BatchesList
        batches={[
          makeItem({ name: "Alpha", status: "processed", createdLabel: "15 Jan 2026" }),
        ]}
      />,
    );

    const row = screen.getByRole("listitem");
    expect(within(row).getByText("Alpha")).toBeInTheDocument();
    expect(within(row).getByText("Processed")).toBeInTheDocument(); // badge label
    expect(within(row).getByText("15 Jan 2026")).toBeInTheDocument();
  });

  it("exposes the raw ISO timestamp as the <time> machine-readable value", () => {
    render(
      <BatchesList
        batches={[makeItem({ created: "2026-01-15T09:30:00Z", createdLabel: "15 Jan 2026" })]}
      />,
    );

    const time = screen.getByText("15 Jan 2026");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("dateTime", "2026-01-15T09:30:00Z");
  });

  it("preserves the server's order (does not reorder)", () => {
    // The server sorts newest-first; the list must render in exactly the order
    // it's given, filtering aside.
    render(
      <BatchesList
        batches={[
          makeItem({ name: "Newest" }),
          makeItem({ name: "Middle" }),
          makeItem({ name: "Oldest" }),
        ]}
      />,
    );

    expect(names()).toEqual(["Newest", "Middle", "Oldest"]);
  });

  describe("name filter", () => {
    it("filters by a case-insensitive substring match as you type", () => {
      render(
        <BatchesList
          batches={[
            makeItem({ name: "Spring run" }),
            makeItem({ name: "Autumn batch" }),
            makeItem({ name: "spring cleanup" }),
          ]}
        />,
      );

      fireEvent.change(screen.getByLabelText("Filter by name"), {
        target: { value: "SPRING" },
      });

      expect(names()).toEqual(["Spring run", "spring cleanup"]);
    });

    it("matches anywhere in the name, not just the start", () => {
      render(
        <BatchesList
          batches={[
            makeItem({ name: "Spring run" }),
            makeItem({ name: "Autumn batch" }),
          ]}
        />,
      );

      fireEvent.change(screen.getByLabelText("Filter by name"), {
        target: { value: "run" },
      });

      expect(screen.getByText("Spring run")).toBeInTheDocument();
      expect(screen.queryByText("Autumn batch")).toBeNull();
    });

    it("ignores surrounding whitespace in the query", () => {
      render(
        <BatchesList
          batches={[makeItem({ name: "Spring run" }), makeItem({ name: "Autumn" })]}
        />,
      );

      fireEvent.change(screen.getByLabelText("Filter by name"), {
        target: { value: "  spring  " },
      });

      expect(screen.getByText("Spring run")).toBeInTheDocument();
      expect(screen.queryByText("Autumn")).toBeNull();
    });
  });

  describe("status filter", () => {
    it("defaults to 'All statuses' and shows every batch", () => {
      render(
        <BatchesList
          batches={[
            makeItem({ name: "A", status: "created" }),
            makeItem({ name: "B", status: "error" }),
          ]}
        />,
      );

      expect(screen.getByLabelText("Filter by status")).toHaveValue("all");
      expect(rows()).toHaveLength(2);
    });

    it("filters to a single selected status", () => {
      render(
        <BatchesList
          batches={[
            makeItem({ name: "A", status: "created" }),
            makeItem({ name: "B", status: "error" }),
            makeItem({ name: "C", status: "error" }),
          ]}
        />,
      );

      fireEvent.change(screen.getByLabelText("Filter by status"), {
        target: { value: "error" },
      });

      expect(names()).toEqual(["B", "C"]);
    });

    it("offers 'All statuses' plus exactly the five known statuses", () => {
      render(<BatchesList batches={[makeItem()]} />);

      const options = within(
        screen.getByLabelText("Filter by status"),
      ).getAllByRole("option");
      expect(options.map((o) => o.textContent)).toEqual([
        "All statuses",
        "Creating",
        "Created",
        "Processing",
        "Processed",
        "Error",
      ]);
    });
  });

  describe("combined filters", () => {
    it("applies the name and status filters together (AND)", () => {
      render(
        <BatchesList
          batches={[
            makeItem({ name: "Spring run", status: "error" }),
            makeItem({ name: "Spring cleanup", status: "processed" }),
            makeItem({ name: "Autumn run", status: "error" }),
          ]}
        />,
      );

      fireEvent.change(screen.getByLabelText("Filter by name"), {
        target: { value: "spring" },
      });
      fireEvent.change(screen.getByLabelText("Filter by status"), {
        target: { value: "error" },
      });

      // Only "Spring run" is both a name match and status=error.
      expect(rows()).toHaveLength(1);
      expect(screen.getByText("Spring run")).toBeInTheDocument();
    });
  });

  describe("empty states", () => {
    it("shows a 'no batches yet' message when the account has none", () => {
      render(<BatchesList batches={[]} />);

      expect(screen.getByText(/don't have any batches yet/i)).toBeInTheDocument();
      // The filters still render (so the component looks consistent), but there
      // is no results list.
      expect(screen.getByLabelText("Filter by name")).toBeInTheDocument();
      expect(screen.queryByRole("list")).toBeNull();
    });

    it("shows a distinct 'no matches' message when filters exclude everything", () => {
      render(
        <BatchesList batches={[makeItem({ name: "Spring run", status: "created" })]} />,
      );

      fireEvent.change(screen.getByLabelText("Filter by name"), {
        target: { value: "nonexistent" },
      });

      expect(screen.getByText(/no batches match your filters/i)).toBeInTheDocument();
      // Crucially NOT the "no batches yet" message — the account does have data.
      expect(screen.queryByText(/don't have any batches yet/i)).toBeNull();
      expect(screen.queryByRole("list")).toBeNull();
    });

    it("restores the list when a too-narrow filter is cleared", () => {
      render(<BatchesList batches={[makeItem({ name: "Spring run" })]} />);

      const input = screen.getByLabelText("Filter by name");
      fireEvent.change(input, { target: { value: "zzz" } });
      expect(screen.queryByRole("list")).toBeNull();

      fireEvent.change(input, { target: { value: "" } });
      expect(screen.getByText("Spring run")).toBeInTheDocument();
    });
  });

  describe("status badge color", () => {
    // The badge derives its background + text from the status's seed color via
    // `color-mix`, blended against the theme tokens (so it stays legible in both
    // light and dark mode). jsdom may serialize the seed hex to its rgb() form
    // inside the stored inline style, so accept either representation. Assert
    // against the imported STATUS_COLORS seed (not a hardcoded literal) so the
    // test tracks the source rather than re-encoding the palette. Labels also
    // appear as <option>s in the status <select>, so lookups are scoped to the
    // results row.
    //
    // #ef4444 -> rgb(239, 68, 68), #22c55e -> rgb(34, 197, 94).
    const hexToRgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    /** True if the inline style references the status's seed color at all. */
    const tintsFrom = (style: string, status: "processed" | "error") => {
      const hex = STATUS_COLORS[status];
      return style.includes(hex) || style.includes(hexToRgb(hex));
    };

    it("tints each badge from its status color (error = red-derived)", () => {
      render(<BatchesList batches={[makeItem({ name: "Boom", status: "error" })]} />);

      const badge = within(screen.getByRole("listitem")).getByText("Error");
      const style = badge.getAttribute("style") ?? "";
      // The seed red is mixed into the badge, and it blends against the theme
      // background token (not a hardcoded white) so dark mode stays legible.
      expect(tintsFrom(style, "error")).toBe(true);
      expect(style).toContain("var(--background)");
      expect(style).toContain("var(--foreground)");
    });

    it("uses different colors for different statuses", () => {
      render(
        <BatchesList
          batches={[
            makeItem({ name: "ok", status: "processed" }),
            makeItem({ name: "bad", status: "error" }),
          ]}
        />,
      );

      const [first, second] = rows();
      const processed = within(first!).getByText("Processed").getAttribute("style") ?? "";
      const error = within(second!).getByText("Error").getAttribute("style") ?? "";
      expect(tintsFrom(processed, "processed")).toBe(true);
      expect(tintsFrom(error, "error")).toBe(true);
      expect(processed).not.toBe(error);
    });
  });

  describe("row actions", () => {
    it("renders an edit and a delete icon button on every row, labelled by batch", () => {
      render(
        <BatchesList
          batches={[makeItem({ name: "Spring run" }), makeItem({ name: "Autumn" })]}
        />,
      );

      // Accessible names include the batch name so the action is unambiguous.
      expect(
        screen.getByRole("button", { name: "Edit Spring run" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Delete Spring run" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Edit Autumn" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Delete Autumn" }),
      ).toBeInTheDocument();
    });

    it("opens the edit dialog for the clicked row, prefilled with its name", () => {
      render(<BatchesList batches={[makeItem({ name: "Spring run" })]} />);

      fireEvent.click(screen.getByRole("button", { name: "Edit Spring run" }));

      const dialog = screen.getByRole("dialog", { name: "Edit batch" });
      expect(dialog).toBeInTheDocument();
      // The name field is prefilled with the row's current name.
      expect(within(dialog).getByLabelText("Name")).toHaveValue("Spring run");
    });

    it("opens the delete confirmation for the clicked row, naming the batch", () => {
      render(<BatchesList batches={[makeItem({ name: "Spring run" })]} />);

      fireEvent.click(screen.getByRole("button", { name: "Delete Spring run" }));

      const dialog = screen.getByRole("dialog", { name: "Delete batch" });
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByText("Spring run")).toBeInTheDocument();
      expect(
        within(dialog).getByRole("button", { name: /delete batch/i }),
      ).toBeInTheDocument();
    });

    it("targets the correct batch when multiple rows exist", () => {
      render(
        <BatchesList
          batches={[
            makeItem({ name: "First" }),
            makeItem({ name: "Second" }),
          ]}
        />,
      );

      // Edit the second row; the dialog must prefill "Second", not "First".
      fireEvent.click(screen.getByRole("button", { name: "Edit Second" }));

      const dialog = screen.getByRole("dialog", { name: "Edit batch" });
      expect(within(dialog).getByLabelText("Name")).toHaveValue("Second");
    });
  });
});
