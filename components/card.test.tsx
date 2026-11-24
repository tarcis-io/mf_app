import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Card from "./card";

/**
 * `Card` is the shared shell behind every card in the app (home Batches, the
 * /batches list, Settings, About). Its consumers' tests lean on the behaviors
 * guarded here — the labelled `region` (keyed by the heading id) and the
 * header `actions` slot that must survive even when the body fails to load — so
 * asserting them directly keeps the contract pinned at the source.
 */
describe("Card", () => {
  it("is a labelled region whose accessible name is its title", () => {
    render(
      <Card id="demo" title="Batches" icon={<svg data-testid="icon" />}>
        <p>body</p>
      </Card>,
    );

    // <section aria-labelledby> + an <h2 id> → a region named by the heading.
    const region = screen.getByRole("region", { name: "Batches" });
    expect(region).toBeInTheDocument();
    expect(
      within(region).getByRole("heading", { level: 2, name: "Batches" }),
    ).toBeInTheDocument();
  });

  it("wires aria-labelledby to the heading via the given id", () => {
    render(
      <Card id="my-card-id" title="Title" icon={<svg />}>
        <p>body</p>
      </Card>,
    );

    const region = screen.getByRole("region", { name: "Title" });
    expect(region).toHaveAttribute("aria-labelledby", "my-card-id");
    expect(
      screen.getByRole("heading", { level: 2, name: "Title" }),
    ).toHaveAttribute("id", "my-card-id");
  });

  it("renders the icon beside the title and the body content", () => {
    render(
      <Card id="demo" title="Title" icon={<svg data-testid="icon" />}>
        <p>the body</p>
      </Card>,
    );

    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("the body")).toBeInTheDocument();
  });

  it("renders the optional actions and footer slots when provided", () => {
    render(
      <Card
        id="demo"
        title="Title"
        icon={<svg />}
        actions={<button type="button">New</button>}
        footer={<a href="/more">View all</a>}
      >
        <p>body</p>
      </Card>,
    );

    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all" })).toBeInTheDocument();
  });

  it("omits the actions and footer slots when not provided", () => {
    render(
      <Card id="demo" title="Title" icon={<svg />}>
        <p>body</p>
      </Card>,
    );

    // Nothing stray in the header/footer: the only control-less card renders
    // just its heading + body (no buttons or links introduced by the shell).
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
