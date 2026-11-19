import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// usePathname drives the active-link highlight. Program it per test via the
// hoisted mock so we can assert which item is marked current.
const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn(() => "/") }));
vi.mock("next/navigation", () => ({ usePathname }));

// next/link's real click handler calls preventDefault and hands off to the App
// Router's navigator, which isn't wired up in jsdom. The shell only relies on
// Link rendering an anchor and forwarding onClick (to close the mobile drawer),
// so stub it with a plain anchor that preserves those — keeping these tests on
// the shell's own behavior, not Next's navigation internals.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

// next/image likewise renders a plain <img> with props forwarded, which is all
// the brand logo assertion needs.
vi.mock("next/image", () => ({
  default: ({
    alt = "",
    ...rest
  }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...rest} />
  ),
}));

// The sign-out form uses a Server Action; stub it to a no-op so submitting the
// form in tests doesn't try to reach Auth.js. (The real action is covered by
// its own module + the auth flow.)
vi.mock("@/app/actions", () => ({ signOutAction: vi.fn() }));

import AppShell from "./app-shell";

function renderShell(title = "Home", children: React.ReactNode = <p>Body</p>) {
  return render(
    <AppShell title={title} userLabel={<span>Ada Lovelace</span>}>
      {children}
    </AppShell>,
  );
}

// The drag-to-close gate asks `matchMedia("(min-width: 1024px)")` whether the
// drawer is a desktop static column (drag disabled) or a slide-over (enabled).
// jsdom doesn't implement matchMedia, so install a controllable stub. `desktop`
// flips what the `min-width: 1024px` query reports.
function setViewport({ desktop }: { desktop: boolean }) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("min-width: 1024px") ? desktop : !desktop,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
}

beforeEach(() => {
  usePathname.mockReturnValue("/");
  // Default to the slide-over (mobile/narrow) viewport, where drag is active.
  setViewport({ desktop: false });
  // jsdom doesn't implement pointer capture; the component calls it optionally.
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  }
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("AppShell", () => {
  it("shows the page title as a level-1 heading in the header", () => {
    renderShell("Home");

    expect(
      screen.getByRole("heading", { level: 1, name: "Home" }),
    ).toBeInTheDocument();
  });

  it("renders the page content inside the main region", () => {
    renderShell("Home", <p>Welcome to MassFlow AI.</p>);

    const main = screen.getByRole("main");
    expect(
      within(main).getByText("Welcome to MassFlow AI."),
    ).toBeInTheDocument();
  });

  it("renders the session user label passed in by the server shell", () => {
    renderShell();

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("renders the brand (logo + app name) in the navigation drawer", () => {
    renderShell();

    const nav = screen.getByRole("navigation", { name: "Primary" });
    // The wordmark is split into "MassFlow" + a dimmed "AI"; assert the whole
    // reads "MassFlow AI".
    expect(within(nav).getByText("AI").parentElement).toHaveTextContent(
      "MassFlow AI",
    );
    // The brand link (its accessible name is the wordmark, since the logo's alt
    // is empty) wraps a decorative <img>. Reach the logo through that link
    // rather than a test id. An empty-alt image has the presentation role and
    // so isn't queryable by role("img") — select the element directly.
    const brandLink = within(nav).getByRole("link", { name: "MassFlow AI" });
    const logo = brandLink.querySelector("img");
    expect(logo).not.toBeNull();
    expect(logo).toHaveAttribute("alt", "");
  });

  it("marks the Home link active when on the home route", () => {
    usePathname.mockReturnValue("/");
    renderShell();

    const nav = screen.getByRole("navigation", { name: "Primary" });
    const home = within(nav).getByRole("link", { name: "Home" });
    expect(home).toHaveAttribute("aria-current", "page");
  });

  it("does not mark Home active on a different route", () => {
    usePathname.mockReturnValue("/reports");
    renderShell();

    const nav = screen.getByRole("navigation", { name: "Primary" });
    const home = within(nav).getByRole("link", { name: "Home" });
    expect(home).not.toHaveAttribute("aria-current");
  });

  it("does not mark the Home link active on a nested route (root is an exact match)", () => {
    // Guards the root special-case in the active-link rule: `/` must match
    // only `/`, never by prefix — otherwise Home would be marked active on
    // every nested path. (Non-root items use a prefix test so they stay active
    // on their children; that branch gets exercised once a second nav item with
    // child routes exists in NAV_ITEMS.)
    usePathname.mockReturnValue("/reports/2024");
    renderShell();

    const nav = screen.getByRole("navigation", { name: "Primary" });
    const home = within(nav).getByRole("link", { name: "Home" });
    expect(home).not.toHaveAttribute("aria-current");
  });

  it("renders Sign out as a submit button inside a form", () => {
    renderShell();

    const signOut = screen.getByRole("button", { name: /sign out/i });
    expect(signOut).toHaveAttribute("type", "submit");
    expect(signOut.closest("form")).not.toBeNull();
  });

  describe("mobile drawer", () => {
    it("is closed initially (menu button reports collapsed)", () => {
      renderShell();

      const menu = screen.getByRole("button", { name: "Open menu" });
      expect(menu).toHaveAttribute("aria-expanded", "false");
      // No backdrop while closed.
      expect(screen.queryByTestId("drawer-backdrop")).toBeNull();
    });

    it("opens when the menu button is clicked", () => {
      renderShell();

      fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

      expect(
        screen.getByRole("button", { name: "Open menu" }),
      ).toHaveAttribute("aria-expanded", "true");
      // Body scroll is locked while the mobile drawer is open.
      expect(document.body.style.overflow).toBe("hidden");
    });

    it("has no in-drawer close button (dismissed via backdrop / Escape / swipe)", () => {
      renderShell();

      fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

      expect(
        screen.queryByRole("button", { name: "Close menu" }),
      ).toBeNull();
    });

    it("restores body scroll after closing", () => {
      renderShell();

      fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
      expect(document.body.style.overflow).toBe("hidden");

      fireEvent.keyDown(document, { key: "Escape" });
      expect(document.body.style.overflow).toBe("");
    });

    it("closes when Escape is pressed", () => {
      renderShell();

      fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
      fireEvent.keyDown(document, { key: "Escape" });

      expect(
        screen.getByRole("button", { name: "Open menu" }),
      ).toHaveAttribute("aria-expanded", "false");
    });

    it("closes when a nav link is activated", () => {
      renderShell();

      fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
      const nav = screen.getByRole("navigation", { name: "Primary" });
      fireEvent.click(within(nav).getByRole("link", { name: "Home" }));

      expect(
        screen.getByRole("button", { name: "Open menu" }),
      ).toHaveAttribute("aria-expanded", "false");
    });

    it("closes when the backdrop is clicked", () => {
      renderShell();

      fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
      fireEvent.click(screen.getByTestId("drawer-backdrop"));

      expect(
        screen.getByRole("button", { name: "Open menu" }),
      ).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByTestId("drawer-backdrop")).toBeNull();
    });
  });

  describe("drag-to-close (pointer)", () => {
    // The close decision compares the drag distance against the drawer's width,
    // which jsdom reports as 0 by default. Give the nav a real width so the
    // threshold math is meaningful.
    function openWithWidth(width = 256) {
      renderShell();
      fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
      const nav = screen.getByRole("navigation", { name: "Primary" });
      Object.defineProperty(nav, "offsetWidth", {
        value: width,
        configurable: true,
      });
      return nav;
    }

    // A primary-pointer drag from `from` to `to` (x). Pointer events (not touch)
    // so a mouse in a narrow window drives it too — the bug this guards against.
    function drag(nav: HTMLElement, from: number, to: number) {
      fireEvent.pointerDown(nav, {
        isPrimary: true,
        button: 0,
        pointerId: 1,
        clientX: from,
      });
      fireEvent.pointerMove(nav, { pointerId: 1, clientX: to });
      fireEvent.pointerUp(nav, { pointerId: 1, clientX: to });
    }

    it("closes when dragged left past the threshold", () => {
      const nav = openWithWidth(256);

      // Drag 150px left on a 256px drawer → past the 1/3 (~85px) threshold.
      drag(nav, 200, 50);

      expect(
        screen.getByRole("button", { name: "Open menu" }),
      ).toHaveAttribute("aria-expanded", "false");
    });

    it("snaps back open when the drag is too short", () => {
      const nav = openWithWidth(256);

      // Drag only 20px left → under the threshold, so it stays open.
      drag(nav, 200, 180);

      expect(
        screen.getByRole("button", { name: "Open menu" }),
      ).toHaveAttribute("aria-expanded", "true");
    });

    it("ignores a rightward drag (cannot be pulled past open)", () => {
      const nav = openWithWidth(256);

      // Dragging right shouldn't close it (and the offset is clamped at 0).
      drag(nav, 50, 200);

      expect(
        screen.getByRole("button", { name: "Open menu" }),
      ).toHaveAttribute("aria-expanded", "true");
    });

    it("works for a mouse in a narrow (below-lg) window", () => {
      // Regression guard for the reported bug: a mouse in a small window gets
      // the slide-over drawer but fires no touch events. With pointer events +
      // the below-lg gate, the drag must still close it. (Viewport defaults to
      // below-lg via setViewport in beforeEach.)
      const nav = openWithWidth(256);

      // A mouse pointer specifically.
      fireEvent.pointerDown(nav, {
        isPrimary: true,
        button: 0,
        pointerId: 1,
        pointerType: "mouse",
        clientX: 200,
      });
      fireEvent.pointerMove(nav, { pointerId: 1, clientX: 40 });
      fireEvent.pointerUp(nav, { pointerId: 1, clientX: 40 });

      expect(
        screen.getByRole("button", { name: "Open menu" }),
      ).toHaveAttribute("aria-expanded", "false");
    });

    it("does NOT drag when the drawer is a static desktop column (lg+)", () => {
      setViewport({ desktop: true });
      const nav = openWithWidth(256);

      // Even a long leftward drag must not close it on desktop.
      drag(nav, 200, 20);

      expect(
        screen.getByRole("button", { name: "Open menu" }),
      ).toHaveAttribute("aria-expanded", "true");
      // And no drag transform was ever applied.
      expect(nav.style.transform).toBe("");
    });

    it("ignores a non-primary button press", () => {
      const nav = openWithWidth(256);

      // Right-click drag (button !== 0) must not start a drag.
      fireEvent.pointerDown(nav, {
        isPrimary: true,
        button: 2,
        pointerId: 1,
        clientX: 200,
      });
      fireEvent.pointerMove(nav, { pointerId: 1, clientX: 40 });
      fireEvent.pointerUp(nav, { pointerId: 1, clientX: 40 });

      expect(
        screen.getByRole("button", { name: "Open menu" }),
      ).toHaveAttribute("aria-expanded", "true");
    });

    it("follows the pointer with an inline leftward transform mid-drag", () => {
      const nav = openWithWidth(256);

      fireEvent.pointerDown(nav, {
        isPrimary: true,
        button: 0,
        pointerId: 1,
        clientX: 200,
      });
      fireEvent.pointerMove(nav, { pointerId: 1, clientX: 120 });

      // Mid-drag the drawer is translated left by the drag distance (80px),
      // with the transition suppressed so it tracks 1:1.
      expect(nav.style.transform).toBe("translateX(-80px)");
      expect(nav.style.transition).toBe("none");

      // After release the inline transform is cleared (class-based transform
      // takes over to animate the result).
      fireEvent.pointerUp(nav, { pointerId: 1, clientX: 120 });
      expect(nav.style.transform).toBe("");
    });
  });

  describe("header scroll shadow", () => {
    it("raises a shadow once the main region is scrolled", () => {
      renderShell();

      const header = screen.getByRole("banner");
      const main = screen.getByRole("main");

      // At the top: no shadow.
      expect(header.className).not.toContain("shadow-sm");

      // Scroll the main region.
      Object.defineProperty(main, "scrollTop", {
        value: 120,
        configurable: true,
      });
      fireEvent.scroll(main);

      expect(header.className).toContain("shadow-sm");

      // Back to top: shadow removed.
      Object.defineProperty(main, "scrollTop", {
        value: 0,
        configurable: true,
      });
      fireEvent.scroll(main);

      expect(header.className).not.toContain("shadow-sm");
    });
  });
});
