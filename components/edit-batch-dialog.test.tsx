import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The dialog renames via renameBatchAction (a "use server" module). Stub it so
// the test drives the dialog's own behavior without the Auth.js runtime or a
// network call. The action's behavior is covered in app/batches/actions.test.ts.
const { renameBatchAction } = vi.hoisted(() => ({ renameBatchAction: vi.fn() }));
vi.mock("@/app/batches/actions", () => ({ renameBatchAction }));

import EditBatchDialog from "./edit-batch-dialog";

// jsdom (31.x) lacks <dialog>.showModal()/close(); the shared Dialog uses them.
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

const BATCH = { id: "batch-1", name: "Spring run" };

function dialogEl(): HTMLDialogElement {
  return document.querySelector("dialog") as HTMLDialogElement;
}

/** Submit the form directly (jsdom doesn't dispatch submit from a button click). */
function submitForm() {
  fireEvent.submit(document.querySelector("form") as HTMLFormElement);
}

beforeEach(() => {
  installDialogPolyfill();
  renameBatchAction.mockReset();
  renameBatchAction.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("EditBatchDialog", () => {
  it("prefills the name field with the batch's current name when open", () => {
    render(
      <EditBatchDialog
        batch={BATCH}
        open
        onClose={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Edit batch" });
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Spring run");
  });

  it("disables 'Edit batch' until the name changes to a new non-empty value", () => {
    render(<EditBatchDialog batch={BATCH} open onClose={vi.fn()} onDone={vi.fn()} />);

    const submit = screen.getByRole("button", { name: /edit batch/i });
    // Unchanged -> disabled (renaming to the same value is a no-op).
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } });
    expect(submit).toBeDisabled(); // empty

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Renamed" },
    });
    expect(submit).toBeEnabled();
  });

  it("calls renameBatchAction with the batch id + new name and closes on success", async () => {
    const onDone = vi.fn();
    renameBatchAction.mockResolvedValue({ ok: true });
    render(<EditBatchDialog batch={BATCH} open onClose={vi.fn()} onDone={onDone} />);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Renamed" },
    });
    submitForm();

    await vi.waitFor(() => expect(renameBatchAction).toHaveBeenCalledOnce());
    const [id, formData] = renameBatchAction.mock.calls[0]!;
    expect(id).toBe("batch-1");
    expect((formData as FormData).get("name")).toBe("Renamed");

    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  });

  it("shows the duplicate-name error in a banner and stays open", async () => {
    renameBatchAction.mockResolvedValue({
      ok: false,
      duplicate: true,
      error: 'A batch named "Renamed" already exists.',
    });
    render(<EditBatchDialog batch={BATCH} open onClose={vi.fn()} onDone={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Renamed" },
    });
    // Move focus off the name field (it autofocuses on mount) so the assertion
    // below genuinely verifies the dialog returns focus to it on a duplicate.
    const cancel = screen.getByRole("button", { name: "Cancel" });
    cancel.focus();
    expect(cancel).toHaveFocus();
    submitForm();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/already exists/i);
    expect(dialogEl().hasAttribute("open")).toBe(true);
    // Duplicate is a field-level problem: name marked invalid and focused.
    const nameInput = screen.getByLabelText("Name");
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveFocus();
    // Editing clears the invalid marker.
    fireEvent.change(nameInput, { target: { value: "Renamed again" } });
    expect(nameInput).not.toHaveAttribute("aria-invalid");
  });

  it("shows a generic error banner on a non-duplicate failure", async () => {
    renameBatchAction.mockResolvedValue({
      ok: false,
      duplicate: false,
      error: "Couldn't rename the batch. Please try again.",
    });
    render(<EditBatchDialog batch={BATCH} open onClose={vi.fn()} onDone={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "X" } });
    submitForm();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't rename the batch/i,
    );
  });

  it("calls onClose (without renaming) when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<EditBatchDialog batch={BATCH} open onClose={onClose} onDone={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(renameBatchAction).not.toHaveBeenCalled();
  });

  it("calls onClose on a backdrop click", () => {
    const onClose = vi.fn();
    render(<EditBatchDialog batch={BATCH} open onClose={onClose} onDone={vi.fn()} />);

    // A click whose target is the <dialog> itself is a backdrop click.
    fireEvent.click(dialogEl());

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders no dialog content when closed", () => {
    render(
      <EditBatchDialog batch={null} open={false} onClose={vi.fn()} onDone={vi.fn()} />,
    );

    // The <dialog> element exists but is closed (no `open`) and has no form.
    expect(dialogEl().hasAttribute("open")).toBe(false);
    expect(document.querySelector("form")).toBeNull();
  });
});
