import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APP_VERSION } from "@/lib/app-info";

// About composes the shared LoggedInTemplate (an async Server Component that
// reads the session). Stub it with a minimal shell that surfaces the `title`
// prop and children, so this test verifies the page's own content without
// pulling in auth. LoggedInTemplate has its own tests. The `templateSpy` (via
// vi.hoisted so it's reachable in the hoisted mock factory) lets us assert the
// page actually delegates to LoggedInTemplate, not just that a heading renders.
const { templateSpy } = vi.hoisted(() => ({ templateSpy: vi.fn() }));

vi.mock("@/components/templates/logged-in-template", () => ({
  default: (props: { title: string; children: ReactNode }) => {
    templateSpy(props);
    return (
      <div data-testid="logged-in-template">
        <h1>{props.title}</h1>
        {props.children}
      </div>
    );
  },
}));

// next/image renders a plain <img> with props forwarded, which is all the
// Application card's logo icon needs (same approach as app-shell's test).
vi.mock("next/image", () => ({
  default: ({
    alt = "",
    ...rest
  }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...rest} />
  ),
}));

// The Service/Engine cards fetch mf_service's /version via `getServiceInfo`.
// Stub it so the test doesn't make a network call (its own behavior is covered
// in `lib/mf-service.test.ts`). The resolved version rows stream from an async
// Server Component inside a Suspense boundary, which RTL can't resolve in jsdom
// (see the note at the bottom) — so these tests assert the static card content:
// titles, names, links, and the version labels shown before values resolve.
const { getServiceInfo } = vi.hoisted(() => ({ getServiceInfo: vi.fn() }));
vi.mock("@/lib/mf-service", () => ({ getServiceInfo }));

import About, { ServiceCards } from "./page";

/** The three cards, each a labelled landmark region keyed by its title. */
function card(name: "Application" | "Service" | "Engine") {
  return screen.getByRole("region", { name });
}

/** The value `<dd>` paired with a given `<dt>` label inside a card. */
function value(card: HTMLElement, label: string): HTMLElement {
  const dt = within(card).getByText(label);
  const dd = dt.nextElementSibling;
  if (!(dd instanceof HTMLElement)) {
    throw new Error(`no value element found for label "${label}"`);
  }
  return dd;
}

beforeEach(() => {
  getServiceInfo.mockReset();
  getServiceInfo.mockResolvedValue({
    name: "mf_service",
    description: "svc",
    version: "9.9.9",
    engine_version: "8.8.8",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("About page", () => {
  it("renders inside the shared LoggedInTemplate shell", () => {
    render(<About />);

    expect(screen.getByTestId("logged-in-template")).toBeInTheDocument();
    expect(templateSpy).toHaveBeenCalledOnce();
  });

  it('passes the "About" title to the template', () => {
    render(<About />);

    expect(templateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "About" }),
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "About" }),
    ).toBeInTheDocument();
  });

  it("renders three labelled cards: Application, Service, Engine", () => {
    render(<About />);

    for (const name of ["Application", "Service", "Engine"] as const) {
      // Each card is a <section aria-labelledby> → a region with its title as
      // the accessible name, with the title as a level-2 heading.
      expect(card(name)).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 2, name }),
      ).toBeInTheDocument();
    }
  });

  it("gives each card a decorative icon beside its title", () => {
    render(<About />);

    // Application uses the brand logo (an <img> with empty alt); the two
    // component cards use decorative inline svgs. All are hidden from AT.
    const appIcon = within(card("Application"))
      .getByRole("heading", { level: 2 })
      .querySelector("img, svg");
    expect(appIcon).not.toBeNull();
    expect(appIcon).toHaveAttribute("aria-hidden", "true");

    for (const name of ["Service", "Engine"] as const) {
      const icon = within(card(name))
        .getByRole("heading", { level: 2 })
        .querySelector("svg");
      expect(icon, `icon for ${name}`).not.toBeNull();
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });

  describe("Application card", () => {
    it("shows the app name and version", () => {
      render(<About />);

      const app = card("Application");
      expect(value(app, "Name")).toHaveTextContent("MassFlow AI");
      // The app's own version comes from package.json via app-info (not the
      // service); assert against the imported constant so the test tracks it.
      expect(value(app, "Version")).toHaveTextContent(`v${APP_VERSION}`);
    });

    it("shows a clickable developer contact and website", () => {
      render(<About />);

      const app = card("Application");
      expect(
        within(app).getByRole("link", { name: "t@rcis.io" }),
      ).toHaveAttribute("href", "mailto:t@rcis.io");
      expect(
        within(app).getByRole("link", { name: "massflowai.com" }),
      ).toHaveAttribute("href", "https://massflowai.com");
    });

    it("links to the mf_app repository", () => {
      render(<About />);

      expect(
        within(card("Application")).getByRole("link", {
          name: "tarcis-io/mf_app",
        }),
      ).toHaveAttribute("href", "https://github.com/tarcis-io/mf_app");
    });
  });

  describe("Service card", () => {
    it("shows the mf_service name and a clickable repository", () => {
      render(<About />);

      const service = card("Service");
      expect(value(service, "Name")).toHaveTextContent("mf_service");
      expect(
        within(service).getByRole("link", { name: "tarcis-io/mf_service" }),
      ).toHaveAttribute("href", "https://github.com/tarcis-io/mf_service");
      // Version label is present; the value streams in behind Suspense.
      expect(within(service).getByText("Version")).toBeInTheDocument();
    });
  });

  describe("Engine card", () => {
    it("shows the mf_engine name and a clickable repository", () => {
      render(<About />);

      const engine = card("Engine");
      expect(value(engine, "Name")).toHaveTextContent("mf_engine");
      expect(
        within(engine).getByRole("link", { name: "tarcis-io/mf_engine" }),
      ).toHaveAttribute("href", "https://github.com/tarcis-io/mf_engine");
      expect(within(engine).getByText("Version")).toBeInTheDocument();
    });
  });

});

// The version *values* resolve from an async Server Component
// (`await getServiceInfo()`) inside a Suspense boundary, which RTL can't flush
// through <About> in jsdom. So render ServiceCards directly (awaited) to assert
// the resolved versions and the "unavailable" fallback when the fetch fails.
describe("ServiceCards", () => {
  it("renders the service and engine versions from getServiceInfo", async () => {
    getServiceInfo.mockResolvedValue({
      name: "mf_service",
      description: "svc",
      version: "9.9.9",
      engine_version: "8.8.8",
    });

    render(await ServiceCards());

    expect(value(card("Service"), "Version")).toHaveTextContent("v9.9.9");
    expect(value(card("Engine"), "Version")).toHaveTextContent("v8.8.8");
    expect(screen.queryByText("unavailable")).toBeNull();
  });

  it("shows 'unavailable' for both versions when getServiceInfo fails", async () => {
    // A backend hiccup must degrade only these two version values, not throw.
    getServiceInfo.mockRejectedValue(new Error("mf_service down"));
    // The component logs the failure server-side; silence it in the test.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(await ServiceCards());

    expect(value(card("Service"), "Version")).toHaveTextContent("unavailable");
    expect(value(card("Engine"), "Version")).toHaveTextContent("unavailable");
    // The cards themselves still render (names + repos), so only the version
    // degrades — the page doesn't fail.
    expect(value(card("Service"), "Name")).toHaveTextContent("mf_service");
    expect(errorSpy).toHaveBeenCalled();
  });
});
