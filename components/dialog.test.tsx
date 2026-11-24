import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import Dialog from "./dialog";

// jsdom (31.x) lacks <dialog>.showModal()/close(); the shared Dialog uses them.
// Mirror the polyfill the feature-dialog tests install: showModal() reflects the
// `open` attribute, and close() clears it AND dispatches the native `close`
// event (which the component listens for to notify its parent).
function installDialogPolyfill() {
  const proto = HTMLDialogElement.prototype;
  if (!proto.showModal) {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (!proto.close) {
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}

function dialogEl(): HTMLDialogElement {
  return document.querySelector("dialog") as HTMLDialogElement;
}

/**
 * Controlled harness: owns `open` the way the real callers (new/edit/delete
 * dialogs) do, so the component is exercised as it ships. `onClose` flips the
 * state to closed and is also a spy so tests can assert it fired.
 */
function Harness({
  initialOpen = true,
  onCloseSpy,
}: {
  initialOpen?: boolean;
  onCloseSpy?: () => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <Dialog
      open={open}
      onClose={() => {
        onCloseSpy?.();
        setOpen(false);
      }}
      title="Test dialog"
    >
      <div>
        <button type="button">Inside</button>
      </div>
    </Dialog>
  );
}

beforeEach(() => {
  installDialogPolyfill();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Dialog", () => {
  it("renders its title and children and opens the native dialog when open", () => {
    render(<Harness />);

    expect(
      screen.getByRole("dialog", { name: "Test dialog" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inside" })).toBeInTheDocument();
    // showModal() (polyfilled) set the `open` attribute.
    expect(dialogEl().hasAttribute("open")).toBe(true);
  });

  it("does not open the native dialog when closed", () => {
    render(<Harness initialOpen={false} />);

    expect(dialogEl().hasAttribute("open")).toBe(false);
  });

  it("calls onClose when Escape triggers the native close event", () => {
    const onClose = vi.fn();
    render(<Harness onCloseSpy={onClose} />);

    // Escape on a modal <dialog> fires its `close` event; the polyfill models
    // that via close(). The component maps that to onClose.
    dialogEl().close();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on a backdrop click (a click on the dialog element itself)", () => {
    const onClose = vi.fn();
    render(<Harness onCloseSpy={onClose} />);

    // A click whose target is the <dialog> element is a backdrop click.
    fireEvent.click(dialogEl());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose when the inner content is clicked", () => {
    const onClose = vi.fn();
    render(<Harness onCloseSpy={onClose} />);

    // Clicking content inside the dialog must not close it (only the backdrop).
    fireEvent.click(screen.getByRole("button", { name: "Inside" }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not re-fire onClose when the parent has already closed it", () => {
    // Guard against a double-close: once the parent sets open=false, the
    // component calls close() on the element, which dispatches `close` again —
    // that must NOT call onClose a second time (the handler guards on `open`).
    const onClose = vi.fn();
    render(<Harness onCloseSpy={onClose} />);

    // First close (e.g. backdrop) → parent flips open to false.
    fireEvent.click(dialogEl());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialogEl().hasAttribute("open")).toBe(false);

    // A further native close event must not notify the parent again.
    dialogEl().dispatchEvent(new Event("close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
