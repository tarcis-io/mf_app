import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The dialog deletes via deleteBatchAction (a "use server" module). Stub it so
// the test drives the dialog's own behavior without the Auth.js runtime or a
// network call. The action's behavior is covered in app/batches/actions.test.ts.
const { deleteBatchAction } = vi.hoisted(() => ({ deleteBatchAction: vi.fn() }));
vi.mock("@/app/batches/actions", () => ({ deleteBatchAction }));

import DeleteBatchDialog from "./delete-batch-dialog";

const BATCH = { id: "batch-1", name: "Spring run" };

function dialogEl(): HTMLDialogElement {
  return document.querySelector("dialog") as HTMLDialogElement;
}

beforeEach(() => {
  deleteBatchAction.mockReset();
  deleteBatchAction.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DeleteBatchDialog", () => {
  it("names the batch in the confirmation copy", () => {
    render(
      <DeleteBatchDialog batch={BATCH} open onClose={vi.fn()} onDone={vi.fn()} />,
    );

    const dialog = screen.getByRole("dialog", { name: "Delete batch" });
    expect(within(dialog).getByText("Spring run")).toBeInTheDocument();
  });

  it("has a destructive confirm button labelled 'Delete batch'", () => {
    render(
      <DeleteBatchDialog batch={BATCH} open onClose={vi.fn()} onDone={vi.fn()} />,
    );

    const dialog = screen.getByRole("dialog", { name: "Delete batch" });
    // Two buttons: Cancel + the destructive confirm.
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /delete batch/i }),
    ).toBeInTheDocument();
  });

  it("calls deleteBatchAction with the batch id and closes on success", async () => {
    const onDone = vi.fn();
    deleteBatchAction.mockResolvedValue({ ok: true });
    render(
      <DeleteBatchDialog batch={BATCH} open onClose={vi.fn()} onDone={onDone} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /delete batch/i }));

    await vi.waitFor(() =>
      expect(deleteBatchAction).toHaveBeenCalledWith("batch-1"),
    );
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  });

  it("shows a pending label and disables Cancel while deleting is in flight", async () => {
    // Hold the action unresolved so the in-flight UI renders.
    let resolve!: (value: { ok: boolean }) => void;
    deleteBatchAction.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const onDone = vi.fn();
    render(
      <DeleteBatchDialog batch={BATCH} open onClose={vi.fn()} onDone={onDone} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /delete batch/i }));

    const confirm = await screen.findByRole("button", { name: /deleting/i });
    expect(confirm).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolve({ ok: true });
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  });

  it("shows an error banner and stays open on failure", async () => {
    deleteBatchAction.mockResolvedValue({
      ok: false,
      error: "Couldn't delete the batch. Please try again.",
    });
    render(
      <DeleteBatchDialog batch={BATCH} open onClose={vi.fn()} onDone={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /delete batch/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't delete the batch/i,
    );
    expect(dialogEl().hasAttribute("open")).toBe(true);
  });

  it("calls onClose (without deleting) when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <DeleteBatchDialog batch={BATCH} open onClose={onClose} onDone={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(deleteBatchAction).not.toHaveBeenCalled();
  });

  it("calls onClose on a backdrop click", () => {
    const onClose = vi.fn();
    render(
      <DeleteBatchDialog batch={BATCH} open onClose={onClose} onDone={vi.fn()} />,
    );

    fireEvent.click(dialogEl());

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders no confirm content when closed", () => {
    render(
      <DeleteBatchDialog
        batch={null}
        open={false}
        onClose={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    expect(dialogEl().hasAttribute("open")).toBe(false);
  });
});
