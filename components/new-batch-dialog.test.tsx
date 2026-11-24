import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BATCH_FILE_FIELDS } from "@/lib/mf-service";

// The dialog submits via the createBatchAction Server Action. Stub it so the
// test drives the dialog's own behavior (open/close, validation, banner)
// without the Auth.js runtime or a network call. The action's behavior is
// covered in app/batches/actions.test.ts.
const { createBatchAction } = vi.hoisted(() => ({ createBatchAction: vi.fn() }));
vi.mock("@/app/batches/actions", () => ({ createBatchAction }));

import NewBatchDialog from "./new-batch-dialog";

// jsdom (31.x) does not implement HTMLDialogElement.showModal()/close() or the
// `open` reflection. Install a minimal faithful polyfill: showModal sets open +
// shows, close hides + dispatches the native `close` event the component
// listens for. Without this the component throws on open.
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

/** A dummy file with the given name (extension drives client-side validation). */
function file(name: string) {
  return new File(["data"], name, { type: "text/plain" });
}

/** Open the dialog by clicking the "+ New" trigger. */
function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: /new/i }));
}

/** The dialog element (the only <dialog> in the tree). */
function dialogEl(): HTMLDialogElement {
  return document.querySelector("dialog") as HTMLDialogElement;
}

/**
 * Submit the form. Fires the form's `submit` event directly rather than
 * clicking the submit button: in jsdom a click on a `type="submit"` button does
 * not reliably dispatch the enclosing form's submit event (more so inside a
 * <dialog>), so the component's `onSubmit` wouldn't run. The component reads the
 * FormData from the same form element, so submitting it is equivalent to a real
 * user submit.
 */
function submitForm() {
  fireEvent.submit(document.querySelector("form") as HTMLFormElement);
}

/** Fill the Name field and choose a valid file for every required input. */
function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Spring run" },
  });
  for (const { field, accept } of BATCH_FILE_FIELDS) {
    const input = document.querySelector(
      `input[name="${field}"]`,
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file(`whatever${accept}`)] } });
  }
}

beforeEach(() => {
  installDialogPolyfill();
  createBatchAction.mockReset();
  createBatchAction.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("NewBatchDialog", () => {
  it("renders a '+ New' trigger and the dialog is closed initially", () => {
    render(<NewBatchDialog />);

    expect(screen.getByRole("button", { name: /new/i })).toBeInTheDocument();
    expect(dialogEl().hasAttribute("open")).toBe(false);
  });

  it("opens the dialog when '+ New' is clicked", () => {
    render(<NewBatchDialog />);

    openDialog();

    expect(dialogEl().hasAttribute("open")).toBe(true);
    expect(
      screen.getByRole("heading", { name: "New batch" }),
    ).toBeInTheDocument();
  });

  it("groups the files into an MZmine card (3) and a GNPS card (2)", () => {
    render(<NewBatchDialog />);
    openDialog();

    const mzmine = screen.getByRole("group", { name: "MZmine files" });
    const gnps = screen.getByRole("group", { name: "GNPS files" });
    // 3 file inputs under MZmine, 2 under GNPS.
    expect(mzmine.querySelectorAll('input[type="file"]')).toHaveLength(3);
    expect(gnps.querySelectorAll('input[type="file"]')).toHaveLength(2);
  });

  it("renders the Name field plus all five file inputs by their field names", () => {
    render(<NewBatchDialog />);
    openDialog();

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    for (const { field } of BATCH_FILE_FIELDS) {
      expect(
        document.querySelector(`input[name="${field}"]`),
        `input ${field}`,
      ).not.toBeNull();
    }
  });

  describe("closing", () => {
    it("closes when Cancel is clicked", () => {
      render(<NewBatchDialog />);
      openDialog();

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(dialogEl().hasAttribute("open")).toBe(false);
    });

    it("closes on a backdrop click (a click whose target is the dialog itself)", () => {
      render(<NewBatchDialog />);
      openDialog();

      // A click on the <dialog> element (not its inner content) is a backdrop
      // click under showModal(); the component closes on it.
      fireEvent.click(dialogEl());

      expect(dialogEl().hasAttribute("open")).toBe(false);
    });

    it("does NOT close when the dialog's inner content is clicked", () => {
      render(<NewBatchDialog />);
      openDialog();

      fireEvent.click(screen.getByRole("heading", { name: "New batch" }));

      expect(dialogEl().hasAttribute("open")).toBe(true);
    });
  });

  describe("validation", () => {
    it("disables 'Create batch' until the name and all files are valid", () => {
      render(<NewBatchDialog />);
      openDialog();

      const submit = screen.getByRole("button", { name: /create batch/i });
      expect(submit).toBeDisabled();

      fillValidForm();
      expect(submit).toBeEnabled();
    });

    it("keeps submit disabled if the name is blank", () => {
      render(<NewBatchDialog />);
      openDialog();
      fillValidForm();
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } });

      expect(screen.getByRole("button", { name: /create batch/i })).toBeDisabled();
    });

    it("rejects a wrong extension and shows a per-field warning", () => {
      render(<NewBatchDialog />);
      openDialog();
      fillValidForm();

      // Replace the GNPS merged-results (.tsv) file with a .csv — wrong type.
      const input = document.querySelector(
        'input[name="gnps_merged_results"]',
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file("results.csv")] } });

      expect(screen.getByText(/expected a \.tsv file/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /create batch/i })).toBeDisabled();
    });

    it("accepts the correct extensions (.csv for mzmine, .tsv for gnps merged)", () => {
      render(<NewBatchDialog />);
      openDialog();
      fillValidForm();

      // No warnings, submit enabled.
      expect(screen.queryByText(/expected a/i)).toBeNull();
      expect(screen.getByRole("button", { name: /create batch/i })).toBeEnabled();
    });
  });

  describe("submission", () => {
    it("calls the action and closes the dialog on success", async () => {
      createBatchAction.mockResolvedValue({ ok: true });
      render(<NewBatchDialog />);
      openDialog();
      fillValidForm();

      submitForm();

      // The action is called with the form's FormData (name + 5 files). It runs
      // inside a transition, so await the call rather than asserting synchronously.
      await vi.waitFor(() => expect(createBatchAction).toHaveBeenCalledOnce());
      const form = createBatchAction.mock.calls[0]![0] as FormData;
      expect(form.get("name")).toBe("Spring run");

      // The transition resolves and the dialog closes.
      await vi.waitFor(() => expect(dialogEl().hasAttribute("open")).toBe(false));
    });

    it("shows the duplicate-name message in the banner and stays open", async () => {
      createBatchAction.mockResolvedValue({
        ok: false,
        duplicate: true,
        error: 'A batch named "Spring run" already exists.',
      });
      render(<NewBatchDialog />);
      openDialog();
      fillValidForm();

      submitForm();

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/already exists/i);
      // It must remain open so the user can fix the name.
      expect(dialogEl().hasAttribute("open")).toBe(true);
      // A duplicate is a field-level problem: the name is marked invalid and
      // focused so the user is taken straight to the one thing to fix.
      const nameInput = screen.getByLabelText("Name");
      expect(nameInput).toHaveAttribute("aria-invalid", "true");
      expect(nameInput).toHaveFocus();
    });

    it("clears the invalid state on the name field once the user edits it", async () => {
      createBatchAction.mockResolvedValue({
        ok: false,
        duplicate: true,
        error: 'A batch named "Spring run" already exists.',
      });
      render(<NewBatchDialog />);
      openDialog();
      fillValidForm();
      submitForm();

      const nameInput = await screen.findByLabelText("Name");
      expect(nameInput).toHaveAttribute("aria-invalid", "true");

      // Editing the name clears the invalid marker (the user is fixing it).
      fireEvent.change(nameInput, { target: { value: "Spring run 2" } });
      expect(nameInput).not.toHaveAttribute("aria-invalid");
    });

    it("shows a generic error banner on a non-duplicate failure", async () => {
      createBatchAction.mockResolvedValue({
        ok: false,
        duplicate: false,
        error: "Couldn't create the batch. Please try again.",
      });
      render(<NewBatchDialog />);
      openDialog();
      fillValidForm();

      submitForm();

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/couldn't create the batch/i);
      expect(dialogEl().hasAttribute("open")).toBe(true);
      // A generic failure is not a name problem, so the field isn't flagged.
      expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
    });
  });

  it("resets the form (name + files cleared) after closing and reopening", () => {
    render(<NewBatchDialog />);
    openDialog();
    fillValidForm();
    expect(screen.getByLabelText("Name")).toHaveValue("Spring run");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    openDialog();

    // A fresh form: name empty, submit disabled again.
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByRole("button", { name: /create batch/i })).toBeDisabled();
  });
});
