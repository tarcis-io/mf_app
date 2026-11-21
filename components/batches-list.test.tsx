import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
    // `color-mix(in srgb, <seed> …)`. jsdom normalizes the seed hex to its
    // rgb() form inside the stored inline style, so assert on that:
    //   #ef4444 -> rgb(239, 68, 68)   #22c55e -> rgb(34, 197, 94)
    // The status labels ("Error", "Processed", …) also appear as <option>s in
    // the status <select>, so badge lookups are scoped to the results row to
    // avoid matching the dropdown options.
    const RED = "rgb(239, 68, 68)";
    const GREEN = "rgb(34, 197, 94)";

    it("tints each badge from its status color (error = red-derived)", () => {
      render(<BatchesList batches={[makeItem({ name: "Boom", status: "error" })]} />);

      const badge = within(screen.getByRole("listitem")).getByText("Error");
      const style = badge.getAttribute("style") ?? "";
      // The seed red is mixed into both the background wash and the text color.
      expect(style).toContain(`color-mix(in srgb, ${RED}`);
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
      const processed = within(first).getByText("Processed").getAttribute("style") ?? "";
      const error = within(second).getByText("Error").getAttribute("style") ?? "";
      expect(processed).toContain(GREEN);
      expect(error).toContain(RED);
      expect(processed).not.toBe(error);
    });
  });
});
